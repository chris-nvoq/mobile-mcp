"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IosManager = exports.IosRobot = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = require("os");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const net_1 = require("net");
const webdriver_agent_1 = require("./webdriver-agent");
const robot_1 = require("./robot");
const WDA_PORT = 8100;
const IOS_TUNNEL_PORT = 60105;
const getGoIosPath = () => {
    if (process.env.GO_IOS_PATH) {
        return process.env.GO_IOS_PATH;
    }
    // fallback to go-ios in PATH via `npm install -g go-ios`
    return "ios";
};
class IosRobot {
    deviceId;
    constructor(deviceId) {
        this.deviceId = deviceId;
    }
    isListeningOnPort(port) {
        return new Promise((resolve, reject) => {
            const client = new net_1.Socket();
            client.connect(port, "localhost", () => {
                client.destroy();
                resolve(true);
            });
            client.on("error", (err) => {
                resolve(false);
            });
        });
    }
    async isTunnelRunning() {
        return await this.isListeningOnPort(IOS_TUNNEL_PORT);
    }
    async isWdaForwardRunning() {
        return await this.isListeningOnPort(WDA_PORT);
    }
    async assertTunnelRunning() {
        if (await this.isTunnelRequired()) {
            if (!(await this.isTunnelRunning())) {
                throw new robot_1.ActionableError("iOS tunnel is not running, please see https://github.com/mobile-next/mobile-mcp/wiki/");
            }
        }
    }
    async wda() {
        await this.assertTunnelRunning();
        if (!(await this.isWdaForwardRunning())) {
            throw new robot_1.ActionableError("Port forwarding to WebDriverAgent is not running (tunnel okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
        }
        const wda = new webdriver_agent_1.WebDriverAgent("localhost", WDA_PORT);
        if (!(await wda.isRunning())) {
            throw new robot_1.ActionableError("WebDriverAgent is not running on device (tunnel okay, port forwarding okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
        }
        return wda;
    }
    async ios(...args) {
        return (0, child_process_1.execFileSync)(getGoIosPath(), ["--udid", this.deviceId, ...args], {}).toString();
    }
    async getIosVersion() {
        const output = await this.ios("info");
        const json = JSON.parse(output);
        return json.ProductVersion;
    }
    async isTunnelRequired() {
        const version = await this.getIosVersion();
        const args = version.split(".");
        return parseInt(args[0], 10) >= 17;
    }
    async getScreenSize() {
        const wda = await this.wda();
        return await wda.getScreenSize();
    }
    async swipe(direction) {
        const wda = await this.wda();
        await wda.swipe(direction);
    }
    async listApps() {
        await this.assertTunnelRunning();
        const output = await this.ios("apps", "--all", "--list");
        return output
            .split("\n")
            .map(line => {
            const [packageName, appName] = line.split(" ");
            return {
                packageName,
                appName,
            };
        });
    }
    async launchApp(packageName) {
        await this.assertTunnelRunning();
        await this.ios("launch", packageName);
    }
    async terminateApp(packageName) {
        await this.assertTunnelRunning();
        await this.ios("kill", packageName);
    }
    async openUrl(url) {
        const wda = await this.wda();
        await wda.openUrl(url);
    }
    async sendKeys(text) {
        const wda = await this.wda();
        await wda.sendKeys(text);
    }
    async pressButton(button) {
        const wda = await this.wda();
        await wda.pressButton(button);
    }
    async tap(x, y) {
        const wda = await this.wda();
        await wda.tap(x, y);
    }
    async getElementsOnScreen() {
        const wda = await this.wda();
        return await wda.getElementsOnScreen();
    }
    async getScreenshot() {
        await this.assertTunnelRunning();
        const tmpFilename = path_1.default.join((0, os_1.tmpdir)(), `screenshot-${(0, crypto_1.randomBytes)(8).toString("hex")}.png`);
        await this.ios("screenshot", "--output", tmpFilename);
        const buffer = (0, fs_1.readFileSync)(tmpFilename);
        (0, fs_1.unlinkSync)(tmpFilename);
        return buffer;
    }
    async setOrientation(orientation) {
        const wda = await this.wda();
        await wda.setOrientation(orientation);
    }
    async getOrientation() {
        const wda = await this.wda();
        return await wda.getOrientation();
    }
}
exports.IosRobot = IosRobot;
class IosManager {
    async isGoIosInstalled() {
        try {
            const output = (0, child_process_1.execFileSync)(getGoIosPath(), ["version"], { stdio: ["pipe", "pipe", "ignore"] }).toString();
            const json = JSON.parse(output);
            return json.version !== undefined && (json.version.startsWith("v") || json.version === "local-build");
        }
        catch (error) {
            return false;
        }
    }
    async getDeviceName(deviceId) {
        const output = (0, child_process_1.execFileSync)(getGoIosPath(), ["info", "--udid", deviceId]).toString();
        const json = JSON.parse(output);
        return json.DeviceName;
    }
    async listDevices() {
        if (!(await this.isGoIosInstalled())) {
            console.error("go-ios is not installed, no physical iOS devices can be detected");
            return [];
        }
        const output = (0, child_process_1.execFileSync)(getGoIosPath(), ["list"]).toString();
        const json = JSON.parse(output);
        const devices = json.deviceList.map(async (device) => ({
            deviceId: device,
            deviceName: await this.getDeviceName(device),
        }));
        return Promise.all(devices);
    }
}
exports.IosManager = IosManager;
