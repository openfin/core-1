/*
Copyright 2017 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/*
    src/browser/convert_options.js
 */

// built-in modules
let fs = require('fs');
let path = require('path');

let ResourceFetcher = require('electron').resourceFetcher;

// npm modules
let _ = require('underscore');

// local modules
let coreState = require('./core_state.js');
let log = require('./log');
let regex = require('../common/regex');

// constants
import {
    DEFAULT_RESIZE_REGION_SIZE,
    DEFAULT_RESIZE_REGION_BOTTOM_RIGHT_CORNER
} from '../shapes';

// this is the 5.0 base to be sure that we are only extending what is already expected
function five0BaseOptions() {
    return {
        'accelerator': {
            'devtools': false,
            'zoom': false,
            'reload': false,
            'reloadIgnoringCache': false
        },
        'alphaMask': {
            'blue': -1,
            'green': -1,
            'red': -1
        },
        'alwaysOnBottom': false,
        'alwaysOnTop': false,
        'applicationIcon': '',
        'autoShow': false,
        'backgroundThrottling': false,
        'contextMenu': true,
        'cornerRounding': {
            'height': 0,
            'width': 0
        },
        'defaultCentered': false,
        'defaultHeight': 500,
        'defaultLeft': 10,
        'defaultTop': 10,
        'defaultWidth': 800,
        'delay_connection': false,
        'disableIabSecureLogging': false,
        'draggable': false,
        'exitOnClose': false,
        'frame': true,
        'frameConnect': '',
        'hideOnBlur': false,
        'hideOnClose': false,
        'hideWhileChildrenVisible': false,
        'icon': '',
        'launchExternal': '',
        'loadErrorMessage': '',
        'maxHeight': -1,
        'maxWidth': -1,
        'maximizable': true,
        'minHeight': 0,
        'minWidth': 0,
        'minimizable': true,
        'name': '',
        'opacity': 1,
        'plugins': false,
        'resizable': true,
        'resize': true,
        'resizeRegion': {
            'bottomRightCorner': DEFAULT_RESIZE_REGION_BOTTOM_RIGHT_CORNER,
            'size': DEFAULT_RESIZE_REGION_SIZE
        },
        'saveWindowState': true,
        'shadow': false,
        'showTaskbarIcon': true,
        'smallWindow': false,
        'state': 'normal',
        'taskbarIcon': '',
        'taskbarIconGroup': '',
        'transparent': false,
        'url': 'about:blank',
        'uuid': '',
        'waitForPageLoad': true,
        'backgroundColor': '#FFF',
        'webSecurity': true
    };
}

function isInContainer(type) {
    return process && process.versions && process.versions[type];
}

function readFile(filePath, done, onError) {
    log.writeToLog(1, `Requested contents from ${filePath}`, true);
    let normalizedPath = path.resolve(filePath);
    log.writeToLog(1, `Normalized path as ${normalizedPath}`, true);
    fs.readFile(normalizedPath, 'utf8', (err, data) => {
        if (err) {
            onError(err);
            return;
        }

        log.writeToLog(1, `Contents from ${normalizedPath}`, true);
        log.writeToLog(1, data, true);

        let config;
        try {
            config = JSON.parse(data);
        } catch (e) {
            onError(e);
            return;
        }
        done(config);
    });
}

function getURL(url, done, onError) {
    const fetcher = new ResourceFetcher('string');

    fetcher.once('fetch-complete', (object, status, data) => {
        if (status !== 'success') {
            onError(new Error(`Could not retrieve ${url}`));
            return;
        }

        log.writeToLog(1, `Contents from ${url}`, true);
        log.writeToLog(1, data, true);

        try {
            const config = JSON.parse(data);
            done(config);
        } catch (e) {
            onError(new Error(`Error parsing JSON from ${url}`));
        }
    });

    log.writeToLog(1, `Fetching ${url}`, true);
    fetcher.fetch(url);
}

function validateOptions(options) {
    var baseOptions = five0BaseOptions();

    // extend the base options to handle a raw window.open
    // exclusde from the general base options as this is internal use
    if (options.rawWindowOpen) {
        baseOptions.rawWindowOpen = options.rawWindowOpen;
    }

    return validate(baseOptions, options);
}

function validate(base, user) {
    let options = {};

    _.each(base, (value, key) => {
        const baseType = typeof base[key];
        const userType = typeof user[key];

        if (baseType === 'object') {
            options[key] = validate(base[key], user[key] || {});
        } else {
            options[key] = (userType !== baseType) ? base[key] : user[key];
        }
    });

    return options;
}

function fetchLocalConfig(configUrl, successCallback, errorCallback) {
    log.writeToLog(1, `Falling back on local-startup-url path: ${configUrl}`, true);
    readFile(configUrl, configObject => {
        successCallback({
            configObject,
            configUrl
        });
    }, errorCallback);
}

module.exports = {

    getStartupAppOptions: function(appJson) {
        let opts = appJson['startup_app'];
        if (opts) {
            opts.plugin = appJson['plugin'];
            opts.preload = appJson['preload'];
        }
        return opts;
    },

    convertToElectron: function(options, returnAsString) {

        // build on top of the 5.0 base
        let newOptions = validateOptions(options);

        if (isInContainer('openfin')) {
            newOptions.resizable = newOptions.resize && newOptions.resizable;
            newOptions.show = newOptions.autoShow && !newOptions.waitForPageLoad;
            newOptions.skipTaskbar = !newOptions.showTaskbarIcon;
            newOptions.title = newOptions.name;

            let minHeight = newOptions.minHeight;
            let maxHeight = newOptions.maxHeight;
            let defaultHeight = newOptions.defaultHeight;
            if (defaultHeight < minHeight) {
                newOptions.height = minHeight;
            } else if (maxHeight !== -1 && defaultHeight > maxHeight) {
                newOptions.height = maxHeight;
            } else {
                newOptions.height = defaultHeight;
            }

            let defaultWidth = newOptions.defaultWidth;
            let minWidth = newOptions.minWidth;
            let maxWidth = newOptions.maxWidth;
            if (defaultWidth < minWidth) {
                newOptions.width = minWidth;
            } else if (maxWidth !== -1 && defaultWidth > maxWidth) {
                newOptions.width = maxWidth;
            } else {
                newOptions.width = defaultWidth;
            }

            newOptions.center = newOptions.defaultCentered;
            if (!newOptions.center) {
                newOptions.x = newOptions.defaultLeft;
                newOptions.y = newOptions.defaultTop;
            }
        }

        // Electron BrowserWindow options
        newOptions.enableLargerThanScreen = true;
        newOptions['enable-plugins'] = true;
        newOptions.webPreferences = {
            nodeIntegration: false,
            plugins: newOptions.plugins
        };

        if (coreState.argo['disable-web-security'] || newOptions.webSecurity === false) {
            newOptions.webPreferences.webSecurity = false;
        }

        if (options.message !== undefined) {
            newOptions.message = options.message;
        }

        if (options.customData !== undefined) {
            newOptions.customData = options.customData;
        }

        if (options.permissions !== undefined) { // API policy
            newOptions.permissions = options.permissions;
        }

        if ('preload' in options) {
            newOptions.preload = normalizePreload(options.preload);
        }

        const plugin = options['plugin'];
        if (!plugin) {
            // for all falsy values
            newOptions.plugin = [];
        } else {
            newOptions.plugin = plugin;
        }

        if (options.customRequestHeaders !== undefined) {
            newOptions.customRequestHeaders = options.customRequestHeaders;
        }

        if (returnAsString) {
            return JSON.stringify(newOptions);
        } else {
            return JSON.parse(JSON.stringify(newOptions));
        }
    },

    fetchOptions: function(argo, onComplete, onError) {
        // ensure removal of eclosing double-quotes when absolute path.
        let configUrl = (argo['startup-url'] || argo['config']);
        let localConfigPath = argo['local-startup-url'];
        let offlineAccess = false;
        let errorCallback = err => {
            if (offlineAccess) {
                fetchLocalConfig(localConfigPath, onComplete, onError);
            } else {
                onError(err);
            }
        };

        // if local-startup-url is defined and its config specifies offline mode, then
        // allow fetching from the local-startup-url config
        if (localConfigPath) {
            try {
                let localConfig = JSON.parse(fs.readFileSync(localConfigPath));

                if (localConfig['offlineAccess']) {
                    offlineAccess = true;
                }
            } catch (err) {
                log.writeToLog(1, err, true);
            }
        }

        if (typeof configUrl !== 'string') {
            configUrl = '';
        }

        configUrl = configUrl.replace(/"/g, '');

        if (!configUrl) {
            if (typeof onError === 'function') {
                onError(new Error('missing runtime argument --startup-url'));
            }
            return;
        }

        if (regex.isURL(configUrl)) {
            return getURL(configUrl, configObject => {
                onComplete({
                    configObject,
                    configUrl
                });
            }, errorCallback);
        }

        let filepath = regex.isURI(configUrl) ? regex.uriToPath(configUrl) : configUrl;

        return readFile(filepath, configObject => {
            onComplete({
                configObject,
                configUrl
            });
        }, errorCallback);
    }

};

function normalizePreload(preload) {
    if (preload === null || preload === false) {
        preload = '';
    }

    if (typeof preload === 'string') {
        // convert legacy `preload` option into modern `preload` option
        return preload === '' ? [] : [{ url: preload }];
    }

    if (
        Array.isArray(preload) &&
        preload.every(p => typeof p === 'object' && typeof p.url === 'string')
    ) {
        return preload.filter(p => p.url !== ''); // filter out empties
    }

    log.writeToLog('warning', 'Expected `preload` option to be null, false, string, or array of objects with `url` string properties.');
    return []; // no preloads when bad option
}
