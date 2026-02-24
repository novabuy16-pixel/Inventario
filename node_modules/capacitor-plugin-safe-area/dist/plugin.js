var capacitorSafeArea = (function (exports, core) {
    'use strict';

    exports.StatusbarStyle = void 0;
    (function (StatusbarStyle) {
        StatusbarStyle["Light"] = "light";
        StatusbarStyle["Dark"] = "dark";
    })(exports.StatusbarStyle || (exports.StatusbarStyle = {}));

    const SafeArea = core.registerPlugin('SafeArea', {
        web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.SafeAreaWeb()),
    });

    class SafeAreaWeb extends core.WebPlugin {
        async getSafeAreaInsets() {
            return {
                insets: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                },
            };
        }
        async getStatusBarHeight() {
            // throw this.unimplemented('Method not supported on Web.');
            return {
                statusBarHeight: 0,
            };
        }
        setImmersiveNavigationBar() {
            throw this.unimplemented('Method not supported on Web.');
        }
        unsetImmersiveNavigationBar() {
            throw this.unimplemented('Method not supported on Web.');
        }
    }

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        SafeAreaWeb: SafeAreaWeb
    });

    exports.SafeArea = SafeArea;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
