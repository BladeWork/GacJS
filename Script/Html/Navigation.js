/*
API:

    class INavigationController
    {
    protected:
        abstract void OnSubControllerInstalled(INavigationController subController);
        abstract void OnSubControllerUninstalled(INavigationController subController);

    public:
        void NavigateTo(INavigationController subController);
        INavigationController SubController { get; }
    }

    void InitializeNavigation(string hashFlag, INavigationController rootType);

    void RegisterNavigationPath(pattern, type, defaultValues, parentType);
        type with the pattern is cascade
        example: (localhost:80 represents the actual url)
            RegisterNavigationPath("/", HomeController);
                http://localhost:80
                http://localhost:80#<hashFlag>
            RegisterNavigationPath("/Home", HomeController);
                http://localhost:80#<hashFlag>/Home
            RegisterNavigationPath("/GettingStarted", GettingStartedController);
                http://localhost:80#<hashFlag>/GettingStarted
            RegisterNavigationPath("/Download", DownloadController);
                http://localhost:80#<hashFlag>/Download
            RegisterNavigationPath("/Demo", DemoController);
                http://localhost:80#<hashFlag>/Demo
            RegisterNavigationPath("/{DemoName}", IndividualDemoController, {}, DemoController);
                http://localhost:80#<hashFlag>/Demo/HelloWorld
            RegisterNavigationPath("/Source", DemoSourceController, {FileName:"main.cpp"}, IndividualDemoController);
                http://localhost:80#<hashFlag>/Demo/HelloWorld/Source
                ==> http://localhost:80#<hashFlag>/Demo/HelloWorld/Source/main.cpp
            RegisterNavigationPath("/Source/{FileName}", DemoSourceController, {}, IndividualDemoController);
                http://localhost:80#<hashFlag>/Demo/HelloWorld/Source/main.cpp
            RegisterNavigationPath("/Document", DocumentController, {Symbols:["vl","presentation","controls","GuiControl"]});
                http://localhost:80#<hashFlag>/Document
                ==> http://localhost:80#<hashFlag>/Document/vl/presentation/controls/GuiControl
            RegisterNavigationPath("/Document/{*Symbols}", DocumentController);
                http://localhost:80#<hashFlag>/Document/vl/presentation/controls/GuiControl
                {*xx} should be at the end of a complete pattern

    string BuildNavigation(Path|Hash|Url)([{type:type, values:values}, {type:type, values:values},  ...]);
        example:
            BuildNavigationPath([
                [DemoController, {}],
                [IndividualDemoController, {DemoName:"HelloWorld"}]
                [DemoSourceController, {FileName:"main.cpp"}]
                ])
            returns
                Path: Demo/HelloWorld/Source/main.cpp
                Hash: #<hashFlag>/Demo/HelloWorld/Source/main.cpp
                Path: http://localhost:80#<hashFlag>/Demo/HelloWorld/Source/main.cpp

    [{type:type, values:values}, {type:type, values:values},  ...] ParseNavigationPath(string path);
        reverted BuildNavigationPath

    void NavigateTo(string path);
        navigate to http://localhost:80/#<hashFlag><path>

    void StartNavigation();
        read the current hash and navigate
*/
Packages.Define("Html.Navigation", ["Class"], function (__injection__) {
    eval(__injection__);

    function FQN(name) {
        return "<Html.Navigation>::" + name;
    }

    /********************************************************************************
    INativationController
    ********************************************************************************/

    var INativationController = Class(FQN("INavigationController"), {
        subController: Private(null),

        OnSubControllerInstalled: Protected.Abstract(),
        OnSubControllerUninstalled: Protected.Abstract(),

        NavigateTo: Public.StrongTyped(__Void, [INativationController], function (subController) {
            if (this.subController !== null) {
                this.subController.NavigateTo(null);
                this.OnSubControllerUninstalled(this.subController);
                this.subController = null;
            }
            this.subController = subController;
            if (this.subController !== null) {
                this.OnSubControllerInstalled(this.subController);
                this.subController = null;
            }
        }),

        GetSubController: Public.StrongTyped(INativationController, [], function () {
            return this.subController;
        }),
        SubController: Public.Property({ readonly: true }),
    });

    /********************************************************************************
    PatternHandler
    ********************************************************************************/

    var IPatternHandlerCallback = Class(FQN("IPatternHandlerCallback"), {
        storage: Protected(null),

        Set: Public.Abstract(),
        Create: Public.Abstract(),

        nav_GetStorage: Public(function () {
            return this.storage;
        }),

        __Constructor: Public(function () {
            this.storage = { inArray: false, assignedArguments: 0 };
        }),
    });

    var PatternHandler = Class(FQN("PatternHandler"), function () {
        return {
            key: Protected(null),
            arguments: Protected(null),
            controllerType: Protected(null),
            level: Protected(null),
            patternIndex: Protected(null),

            __Constructor: Public(function (key) {
                this.key = (key === undefined ? null : key);
                this.arguments = {};
                this.patternIndex = {};
            }),

            Argument: Public.StrongTyped(__Void, [__String, __Number], function (argumentName, argumentIndex) {
                if (this.arguments.hasOwnProperty(argumentName)) {
                    throw new Error("Argument \"" + argumentName + "\" has already been assigned.");
                }
                this.arguments[argumentName] = argumentIndex;
            }),

            Setter: Public.StrongTyped(__Void, [__String, __String], function (argumentName, argumentValue) {
                if (this.arguments.hasOwnProperty(argumentName)) {
                    throw new Error("Argument \"" + argumentName + "\" has already been assigned.");
                }
                this.arguments[argumentName] = argumentValue;
            }),

            ControllerType: Public.StrongTyped(__Void, [__Type, __Number], function (controllerType, level) {
                if (this.controllerType !== null) {
                    throw new Error("Controller type has already been assigned");
                }
                if (!INativationController.IsAssignableFrom(controllerType)) {
                    throw new Error("Controller type should implements \"" + INativationController.FullName + "\".");
                }
                this.controllerType = controllerType;
                this.level = level;
            }),

            AppendHandler: Protected.StrongTyped(PatternHandler, [__String], function (key) {
                var handlers = this.patternIndex[key];
                if (handlers === undefined) {
                    handlers = [];
                    this.patternIndex[key] = handlers;
                }

                var handler = new PatternHandler(key);
                handlers.push(handler);
                return handler;
            }),

            ConstantIndex: Public.StrongTyped(PatternHandler, [__String], function (constant) {
                return this.AppendHandler(constant);
            }),

            ArgumentIndex: Public.StrongTyped(PatternHandler, [__Number], function (index) {
                return this.AppendHandler("+");
            }),

            ArrayIndex: Public.StrongTyped(PatternHandler, [__Number], function (index) {
                return this.AppendHandler("*");
            }),

            Parse: Public.Virtual.StrongTyped(__Array, [__String], function (fragment) {
                if (this.key === "*") {
                    return [this.__ExternalReference];
                }

                var constantHandlers = this.patternIndex[fragment];
                if (constantHandlers === undefined) constantHandlers = [];

                var argumentHandlers = this.patternIndex["+"];
                if (argumentHandlers === undefined) argumentHandlers = [];

                var arrayHandlers = this.patternIndex["*"];
                if (arrayHandlers === undefined) arrayHandlers = [];

                return [].concat(constantHandlers, argumentHandlers, arrayHandlers);
            }),

            ExecuteCommands: Protected(function (storage, callback) {
                for (var i in this.arguments) {
                    var value = this.arguments[i];
                    if (typeof value === "number") {
                        callback.Set(i, storage[value]);
                    }
                    else {
                        callback.Set(i, value);
                    }
                }
                if (this.controllerType !== null) {
                    callback.Create(this.controllerType, this.level);
                }
            }),

            Execute: Public.StrongTyped(__Void, [__String, IPatternHandlerCallback], function (fragment, callback) {
                var storage = callback.nav_GetStorage();
                switch (this.key) {
                    case "+":
                        storage[storage.assignedArguments++] = fragment;
                        break;
                    case "*":
                        if (!storage.inArray) {
                            storage.inArray = true;
                            storage[storage.assignedArguments] = [];
                        }
                        storage[storage.assignedArguments].push(fragment);
                        break;
                }

                if (!storage.inArray) {
                    this.ExecuteCommands(storage, callback);
                }
            }),

            Finish: Public.Virtual.StrongTyped(__Void, [IPatternHandlerCallback], function (callback) {
                var storage = callback.nav_GetStorage();
                if (this.controllerType !== null) {
                    this.ExecuteCommands(storage, callback);
                }
                else {
                    throw new Error("Unexpected end of input.");
                }
            }),
        }
    });

    /********************************************************************************
    Configuration
    ********************************************************************************/

    var PathFragmentType = Enum(FQN("PathFragmentType"), {
        Constant: 0,
        Argument: 1,
        Array: 2,
    });

    var PathFragment = Struct(FQN("PathFragment"), {
        type: PathFragmentType.Description.Constant,
        content: "",
    });

    var PathConfig = Class(FQN("PathConfig"), {
        parentPathConfig: Public(null),
        controllerType: Public(null),
        defaultValues: Public(null),
        handler: Public(null),
        usedArguments: Public(0),
        level: Public(-1),
        pathFragments: Public(null),
    });

    var rootNavigationController = null;
    var rootPatternHandler = null;
    var hashFlag = null;
    var typePathConfigs = null;
    var typeProperties = null;

    function EnsureInitialized() {
        if (rootNavigationController === null) {
            throw new Error("InitializeNavigation should be called before using this function.");
        }
    }

    /********************************************************************************
    InitializeNavigation
    ********************************************************************************/

    function InitializeNavigation(_hashFlag, rootType) {
        rootNavigationController = new rootType();
        rootPatternHandler = new PatternHandler();
        hashFlag = _hashFlag;
        typePathConfigs = {};
        typeProperties = {};
    }

    /********************************************************************************
    RegisterNavigationPath
    ********************************************************************************/

    function ParsePathFragments(pattern) {
        var pathFragments = [];

        var textFragments = pattern.split("/");
        for (var j = (textFragments[0] === "" ? 1 : 0) ; j < textFragments.length; j++) {
            var textFragment = textFragments[j];
            if (textFragment === "+" || textFragment === "*") {
                throw new Error("Fragments in the URL pattern should not be \"+\" or \"*\".");
            }

            var pathFragment = new PathFragment();

            if (textFragment[0] === "{" && textFragment[textFragment.length - 1] === "}") {
                if (textFragment[1] === "*") {
                    pathFragment.type = PathFragmentType.Description.Array;
                    pathFragment.content = textFragment.substring(2, textFragment.length - 1);
                }
                else {
                    pathFragment.type = PathFragmentType.Description.Argument;
                    pathFragment.content = textFragment.substring(1, textFragment.length - 1);
                }
            }
            else {
                pathFragment.type = PathFragmentType.Description.Constant;
                pathFragment.content = textFragment;
            }

            pathFragments.push(pathFragment);
        }

        return pathFragments;
    }

    function RegisterNavigationPath(pattern, type, defaultValues, parentType) {
        EnsureInitialized();

        var pathFragments = ParsePathFragments(pattern);

        var parentPathKey = (parentType === undefined ? "" : parentType.FullName);
        var parentPathConfigs = typePathConfigs[parentPathKey];
        if (parentPathConfigs === undefined) {
            var pathConfig = new PathConfig();
            pathConfig.handler = rootPatternHandler;
            parentPathConfigs = [pathConfig];
            typePathConfigs[parentPathKey] = parentPathConfigs;
        }

        for (var i = 0; i < parentPathConfigs.length; i++) {
            var parentPathConfig = parentPathConfigs[i];
            var handler = parentPathConfig.handler;
            var usedArguments = parentPathConfig.usedArguments;
            var assignedArguments = {};

            for (var j = 0; j < pathFragments.length; j++) {
                var pathFragment = pathFragments[j];
                switch (pathFragment.type) {
                    case PathFragmentType.Description.Constant:
                        handler = handler.ConstantIndex(pathFragment.content);
                        break;
                    case PathFragmentType.Description.Argument:
                        assignedArguments[pathFragment.content] = usedArguments;
                        handler = handler.ArgumentIndex(usedArguments++);
                        break;
                    case PathFragmentType.Description.Array:
                        assignedArguments[pathFragment.content] = usedArguments;
                        handler = handler.ArrayIndex(usedArguments++);
                        break;
                }
            }

            var currentPathConfigs = typePathConfigs[type.FullName];
            if (currentPathConfigs === undefined) {
                currentPathConfigs = [];
                typePathConfigs[type.FullName] = currentPathConfigs;
            }

            var pathConfig = new PathConfig();
            pathConfig.parentPathConfig = parentPathConfig;
            pathConfig.controllerType = type;
            pathConfig.defaultValues = (defaultValues === undefined ? {} : defaultValues);
            pathConfig.handler = handler;
            pathConfig.usedArguments = usedArguments;
            pathConfig.level = parentPathConfig.level + 1;
            pathConfig.pathFragments = pathFragments;
            currentPathConfigs.push(pathConfig);

            var prop = typeProperties[type.FullName];
            if (prop === undefined) {
                prop = {};
                typeProperties[type.FullName] = prop;
            }

            handler.ControllerType(type, pathConfig.level);
            for (var j in assignedArguments) {
                var index = assignedArguments[j];
                handler.Argument(j, index);
                typeProperties[j] = null;
            }
            if (defaultValues !== undefined) {
                for (var j in defaultValues) {
                    var value = defaultValues[j];
                    handler.Setter(j, value);
                    typeProperties[j] = null;
                }
            }
        }
    }

    /********************************************************************************
    BuildNavigationPath
    ********************************************************************************/

    function EnumeratePathConfigsMatrix(arguments, index, postfixMatrix) {
        var type = (index === -1 ? null : arguments[index].type);

        if (postfixMatrix !== undefined) {
            for (var i = postfixMatrix.length - 1; i >= 0; i--) {
                var row = postfixMatrix[i];
                var accepted = row[0].parentPathConfig.controllerType === type;
                if (!accepted) {
                    postfixMatrix.splice(i, 1);
                }
            }

            if (postfixMatrix.length === 0) {
                return [];
            }
        }

        if (index === -1) {
            if (postfixMatrix === undefined) {
                return [];
            }
            else {
                return postfixMatrix;
            }
        }

        var pathConfigs = typePathConfigs[type.FullName];
        if (pathConfigs === undefined) {
            return [];
        }

        var prefixColumn = [];
        for (var i = 0; i < pathConfigs.length; i++) {
            var pathConfig = pathConfigs[i];
            var defaultValues = pathConfig.defaultValues;
            var expectedValues = arguments[index].values;
            var accepted = true;

            for (var j in expectedValues) {
                if (defaultValues.hasOwnProperty(j)) {
                    if (expectedValues[j] !== defaultValues[j]) {
                        accepted = false;
                    }
                }
                if (!accepted) {
                    break;
                }
            }

            if (accepted) {
                prefixColumn.push(pathConfig);
            }
        }

        var matrix = [];
        if (postfixMatrix === undefined) {
            postfixMatrix = [[]];
        }

        for (var i = 0; i < prefixColumn.length; i++) {
            var head = [prefixColumn[i]];
            for (var j = 0; j < postfixMatrix.length; j++) {
                var tail = postfixMatrix[j];
                matrix.push(head.concat(tail));
            }
        }

        return EnumeratePathConfigsMatrix(arguments, index - 1, matrix);
    }

    function BuildNavigationPath(arguments) {
        EnsureInitialized();

        var matrix = EnumeratePathConfigsMatrix(arguments, arguments.length - 1);
        var argumentMap = {};
        for (var i = 0; i < arguments.length; i++) {
            argumentMap[arguments[i].type.FullName] = arguments[i].values;
        }

        var path = undefined;
        var usedArguments = undefined;

        for (var i = 0; i < matrix.length; i++) {
            var row = matrix[i];
            var currentPath = "";
            var currentUsedArguments = 0;
            var accepted = true;

            for (var j = 0; j < row.length; j++) {
                var pathConfig = row[j];
                var values = argumentMap[pathConfig.controllerType.FullName];
                var usedArgumentNames = {};
                var pathFragments = pathConfig.pathFragments;

                for (var k = 0; k < pathFragments.length; k++) {
                    var pathFragment = pathFragments[k];
                    var content = pathFragment.content;
                    switch (pathFragment.type) {
                        case PathFragmentType.Description.Constant:
                            currentPath += "/" + content;
                            break;
                        case PathFragmentType.Description.Argument:
                            if (values.hasOwnProperty(content)) {
                                var value = values[content];
                                if (typeof value === "string") {
                                    currentPath += "/" + value;
                                    currentUsedArguments++;
                                    usedArgumentNames[content] = null;
                                    break;
                                }
                            }
                            accepted = false;
                            break;
                        case PathFragmentType.Description.Array:
                            if (values.hasOwnProperty(content)) {
                                var value = values[content];
                                if (value instanceof Array) {
                                    currentPath += "/" + value.join("/");
                                    currentUsedArguments++;
                                    usedArgumentNames[content] = null;
                                    break;
                                }
                            }
                            accepted = false;
                            break;
                    }
                }

                if (accepted) {
                    for (var k in values) {
                        if (!usedArgumentNames.hasOwnProperty(k) && !pathConfig.defaultValues.hasOwnProperty(k)) {
                            accepted = false;
                            break;
                        }
                    }
                }

                if (!accepted) {
                    break;
                }
            }

            if (accepted) {
                if (usedArguments === undefined ||
                    usedArguments > currentUsedArguments ||
                    (usedArguments === currentUsedArguments && path.length > currentPath.length)) {
                    path = currentPath.substring(1, currentPath.length);
                    usedArguments = currentUsedArguments;
                }
            }
        }

        if (path === undefined) {
            throw new Error("Unable to generate a path according to the arguments.");
        }
        return path;
    }

    function BuildNavigationHash(arguments) {
        return "#" + hashFlag + "/" + BuildNavigationPath(arguments);
    }

    function BuildNavigationUrl(arguments) {
        var href = window.location.href;
        var hash = window.location.hash;
        return href.substring(0, href.length - hash.length) + BuildNavigationHash(arguments);
    }

    /********************************************************************************
    ParseNavigationPath
    ********************************************************************************/

    var ParseCallback = Class(FQN("ParseCallback"), IPatternHandlerCallback, {
        result: Protected(null),

        GetLast: Protected(function () {
            var last = this.result[this.result.length - 1];
            if (last === undefined || last.type !== null) {
                last = { type: null, values: {} }
                this.result.push(last);
            }
            return last;
        }),

        Set: Public.Override.StrongTyped(__Void, [__String, __Object], function (name, value) {
            var last = this.GetLast();
            last.values[name] = value;
        }),
        Create: Public.Override.StrongTyped(__Void, [__Type, __Number], function (type, level) {
            var last = this.GetLast();
            last.type = type;
        }),

        GetResult: Public(function () {
            return this.result;
        }),
        Result: Public.Property({ readonly: true }),

        __Constructor: Public(function () {
            this.__InitBase(IPatternHandlerCallback, []);
            this.result = [];
        }),
    });

    function ParseNavigationPath(path) {
        EnsureInitialized();
        var fragments = path.split("/");
        var handlers = [{ handler: rootPatternHandler, previous: null }];

        for (var i = 0; i < fragments.length; i++) {
            var currentHandlers = [];
            for (var j = 0; j < handlers.length; j++) {
                var previous = handlers[j];
                var resultHandlers = previous.handler.Parse(fragments[i]);
                for (var k = 0; k < resultHandlers.length; k++) {
                    currentHandlers.push({ handler: resultHandlers[k], previous: previous });
                }
            }
            handlers = currentHandlers;
            if (handlers.length === 0) {
                break;
            }
        }

        if (handlers.length === 0) {
            throw new Error("Failed to parse \"" + path + "\".");
        }
        else if (handlers.length > 1) {
            throw new Error("Ambiguous result found from \"" + path + "\".");
        }
        else {
            var orderedHandlers = [];
            var currentHandler = handlers[0];
            while (currentHandler != null) {
                orderedHandlers.splice(0, 0, currentHandler.handler);
                currentHandler = currentHandler.previous;
            }

            var callback = new ParseCallback();
            for (var i = 0; i < orderedHandlers.length; i++) {
                if (i === orderedHandlers.length - 1) {
                    orderedHandlers[i].Finish(callback);
                }
                else {
                    orderedHandlers[i].Execute(fragments[i], callback);
                }
            }
        }
        return callback.Result;
    }

    /********************************************************************************
    NavigateTo
    ********************************************************************************/

    function NavigateTo(path) {
        EnsureInitialized();
        throw new Error("Not Implemented.");
    }

    /********************************************************************************
    StartNavigation
    ********************************************************************************/

    function StartNavigation() {
        var hash = window.location.hash;
        if (hash === "") {
            hash = "#" + hashFlag + "/";
        }
        if (hash[0] === "#") {
            hash = hash.substring(1, hash.length);
        }
        if (hash.length > hashFlag.length) {
            if (hash.substring(0, hashFlag.length + 1) === hashFlag + "/") {
                var path = hash.substring(hashFlag.length + 1, hash.length);
                return NavigateTo(path);
            }
        }
        throw new Error("Failed to navigate by hash \"#" + hash + "\".");
    }

    /********************************************************************************
    Package
    ********************************************************************************/

    return {
        INativationController: INativationController,
        InitializeNavigation: InitializeNavigation,
        RegisterNavigationPath: RegisterNavigationPath,
        BuildNavigationPath: BuildNavigationPath,
        BuildNavigationHash: BuildNavigationHash,
        BuildNavigationUrl: BuildNavigationUrl,
        ParseNavigationPath: ParseNavigationPath,
        NavigateTo: NavigateTo,
        StartNavigation: StartNavigation,
    }
});