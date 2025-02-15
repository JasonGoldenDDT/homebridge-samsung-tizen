let utils           = require('../utils');
let wol             = require('wakeonlan');
let fetch           = require('node-fetch');
let timeoutSignal   = require('timeout-signal');
let isPortReachable = require('is-port-reachable');

const {
    WoLFailedError
} = require('../errors');

const SmartThings = require('./smartthings');

module.exports = class Base {
    constructor(device) {
        this.ip = device.config.ip;
        this.mac = device.config.mac;
        this.name = device.config.name || 'SamsungTvRemote';
        this.timeout = device.config.timeout || 250;
        this.device = device;
        this.cache = device.cache;
        this.smartThings = new SmartThings(device.config.smartthingsToken, device.config.smartthingsDeviceId);
    }

    destroy() {
        this.destroyed = true;
    }

    /**
     * Get state of TV using SmartThings API
     * @return {Promise<boolean>}
     */
    async getState() {
        try {
            this.device.log.debug('[getState] Retrieving power state from SmartThings...');
            const status = await this.smartThings.getDeviceStatus();
            this.device.log.debug(`[getState] SmartThings API status: ${status}`);
            return status === 'on';
        } catch (error) {
            this.device.log.error(`[getState] Error retrieving power state from SmartThings: ${error.message}`);
            return false;
        }
    }
};


    /**
     * Get state of TV by sending a Ping
     * @return {Promise}
     */
    getStatePing() {
        return isPortReachable(8001, {
            host: this.ip,
            timeout: this.timeout
        });
    }

    /**
     * Get state of TV from PowerState response
     * @param  {boolean} fallback
     * @return {Promise}
     */
    getStateHttp(fallback = false) {
        return this.getInfo().then(data => {
            if (data.device && data.device.PowerState) {
                return data.device.PowerState == 'on';
            }

            return false;
        })
        .catch(() => fallback);
    }

    /**
     * Turn the TV On
     * @return {Promise}
     */
    async setStateOn() {
        // If TV is in Sleep mode just send command
        if (await this.getStatePing()) {
            await this.click('KEY_POWER');

            return Promise.resolve();
        }

        // If TV is off, send WoL request
        return new Promise((resolve, reject) => wol(this.device.config.mac, this.device.config.wol)
            .then(() => resolve())
            .catch(() => reject(new WoLFailedError()))
        );
    }

    /**
     * Turn the TV Off
     * @return {Promise}
     */
    setStateOff() {
        return this.click('KEY_POWER');
    }

    /**
     * Get TV informations
     * @return {Promise}
     */
    getInfo() {
        return fetch(`http://${this.ip}:8001/api/v2/`, {
            signal: timeoutSignal(this.timeout < 500 ? 500 : this.timeout)
        })
        .then(body => body.json())
        .then(data => this.device.emit('api.getInfo', data) && data);
    }

    /**
     * Get Application Informations
     * @param  {Number} appId
     * @return {Promise}
     */
    getApplication(appId) {
        return fetch(`http://${this.ip}:8001/api/v2/applications/${appId}`, {
            signal: timeoutSignal(this.timeout)
        })
        .then(body => body.json());
    }

    /**
     * Launch Application
     * @param  {Number} appId
     * @return {Promise}
     */
    startApplication(appId) {
        return fetch(`http://${this.ip}:8001/api/v2/applications/${appId}`, {
            method: 'POST',
            signal: timeoutSignal(this.timeout)
        })
        .then(body => body.json());
    }

    /**
     * Encode TV name to base64
     * @return {string}
     */
    _encodeName() {
        return new Buffer.from(this.name).toString('base64');
    }
}