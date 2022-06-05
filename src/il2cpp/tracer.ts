import { inform } from "../utils/console";
import { fromFridaValue } from "./utils";

/** Tracing utilities. */
class Il2CppTracer {
    /** @internal */
    readonly targets: Il2Cpp.Method[] = [];

    /** @internal */
    #assemblies?: Il2Cpp.Assembly[];

    /** @internal */
    #classes?: Il2Cpp.Class[];

    /** @internal */
    #methods?: Il2Cpp.Method[];

    /** @internal */
    #assemblyFilter?: (assembly: Il2Cpp.Assembly) => boolean;

    /** @internal */
    #classFilter?: (klass: Il2Cpp.Class) => boolean;

    /** @internal */
    #methodFilter?: (method: Il2Cpp.Method) => boolean;

    /** @internal */
    #parameterFilter?: (parameter: Il2Cpp.Parameter) => boolean;
    
    var showUpdate = true;

    domain(): FilterAssemblies {
        return this;
    }

    assemblies(...assemblies: Il2Cpp.Assembly[]): FilterClasses {
        this.#assemblies = assemblies;
        return this;
    }

    classes(...classes: Il2Cpp.Class[]): FilterMethods {
        this.#classes = classes;
        return this;
    }

    methods(...methods: Il2Cpp.Method[]): FilterParameters {
        this.#methods = methods;
        return this;
    }

    filterAssemblies(filter: (assembly: Il2Cpp.Assembly) => boolean): FilterClasses {
        this.#assemblyFilter = filter;
        return this;
    }

    filterClasses(filter: (klass: Il2Cpp.Class) => boolean): FilterMethods {
        this.#classFilter = filter;
        return this;
    }

    filterMethods(filter: (method: Il2Cpp.Method) => boolean): FilterParameters {
        this.#methodFilter = filter;
        return this;
    }

    filterParameters(filter: (parameter: Il2Cpp.Parameter) => boolean): Pick<Il2Cpp.Tracer, "and"> {
        this.#parameterFilter = filter;
        return this;
    }

    hideUpdate() {
        this.showUpdate = false;
        return this;
    }

    checkUpdate(str) {
        if(str === "Update" && this.showUpdate == false)
            return false;
        return true;
    }

    and(): ReturnType<typeof Il2Cpp["trace"]> & Pick<Il2Cpp.Tracer, "attach"> {
        const filterMethod = (method: Il2Cpp.Method): void => {
            if (this.#parameterFilter == undefined) {
                this.targets.push(method);
                return;
            }

            for (const parameter of method.parameters) {
                if (this.#parameterFilter(parameter)) {
                    this.targets.push(method);
                    break;
                }
            }
        };

        const filterMethods = (values: Iterable<Il2Cpp.Method>): void => {
            for (const method of values) {
                filterMethod(method);
            }
        };

        const filterClass = (klass: Il2Cpp.Class): void => {
            if (this.#methodFilter == undefined) {
                filterMethods(klass.methods);
                return;
            }

            for (const method of klass.methods) {
                if (this.#methodFilter(method)) {
                    filterMethod(method);
                }
            }
        };

        const filterClasses = (values: Iterable<Il2Cpp.Class>): void => {
            for (const klass of values) {
                filterClass(klass);
            }
        };

        const filterAssembly = (assembly: Il2Cpp.Assembly): void => {
            if (this.#classFilter == undefined) {
                filterClasses(assembly.image.classes);
                return;
            }

            for (const klass of assembly.image.classes) {
                if (this.#classFilter(klass)) {
                    filterClass(klass);
                }
            }
        };

        const filterAssemblies = (assemblies: Iterable<Il2Cpp.Assembly>): void => {
            for (const assembly of assemblies) {
                filterAssembly(assembly);
            }
        };

        const filterDomain = (domain: typeof Il2Cpp.Domain): void => {
            if (this.#assemblyFilter == undefined) {
                filterAssemblies(domain.assemblies);
                return;
            }

            for (const assembly of domain.assemblies) {
                if (this.#assemblyFilter(assembly)) {
                    filterAssembly(assembly);
                }
            }
        };

        this.#methods
            ? filterMethods(this.#methods)
            : this.#classes
            ? filterClasses(this.#classes)
            : this.#assemblies
            ? filterAssemblies(this.#assemblies)
            : filterDomain(Il2Cpp.Domain);

        this.#assemblies = undefined;
        this.#classes = undefined;
        this.#methods = undefined;
        this.#assemblyFilter = undefined;
        this.#classFilter = undefined;
        this.#methodFilter = undefined;
        this.#parameterFilter = undefined;

        return this;
    }

    attach(mode: "full" | "detailed" = "full"): void {
        let count = 0;

        for (const target of this.targets) {
            if (target.virtualAddress.isNull()) {
                continue;
            }

            const offset = `\x1b[2m0x${target.relativeVirtualAddress.toString(16).padStart(8, `0`)}\x1b[0m`;
            const fullName = `${target.class.type.name}.\x1b[1m${target.name}\x1b[0m`;

            if (mode == "detailed") {
                const startIndex = +!target.isStatic | +Il2Cpp.unityVersionIsBelow201830;

                const callback = (...args: any[]): any => {
                    const thisParameter = target.isStatic ? undefined : new Il2Cpp.Parameter("this", -1, target.class.type);
                    const parameters = thisParameter ? [thisParameter].concat(target.parameters) : target.parameters;

                    if(checkUpdate(target.name))
                    inform(`\
${offset} ${`│ `.repeat(count++)}┌─\x1b[35m${fullName}\x1b[0m(\
${parameters.map(e => `\x1b[32m${e.name}\x1b[0m = \x1b[31m${fromFridaValue(args[e.position + startIndex], e.type)}\x1b[0m`).join(`, `)});`);

                    const returnValue = target.nativeFunction(...args);

                    if(checkUpdate(target.name))
                    inform(`\
${offset} ${`│ `.repeat(--count)}└─\x1b[33m${fullName}\x1b[0m\
${returnValue == undefined ? `` : ` = \x1b[36m${fromFridaValue(returnValue, target.returnType)}`}\x1b[0m;`);

                    return returnValue;
                };

                try {
                    target.revert();
                    const nativeCallback = new NativeCallback(callback, target.returnType.fridaAlias, target.fridaSignature);
                    Interceptor.replace(target.virtualAddress, nativeCallback);
                } catch (e: any) {}
            } else {
                try {
                    Interceptor.attach(target.virtualAddress, {
                        onEnter: () => inform(`${offset} ${`│ `.repeat(count++)}┌─\x1b[35m${fullName}\x1b[0m`),
                        onLeave: () => inform(`${offset} ${`│ `.repeat(--count)}└─\x1b[33m${fullName}\x1b[0m${count == 0 ? `\n` : ``}`)
                    });
                } catch (e: any) {}
            }
        }
    }
}

type FilterAssemblies = FilterClasses & Pick<Il2Cpp.Tracer, "filterAssemblies">;

type FilterClasses = FilterMethods & Pick<Il2Cpp.Tracer, "filterClasses">;

type FilterMethods = FilterParameters & Pick<Il2Cpp.Tracer, "filterMethods">;

type FilterParameters = Pick<Il2Cpp.Tracer, "and"> & Pick<Il2Cpp.Tracer, "filterParameters">;

Il2Cpp.Tracer = Il2CppTracer;

declare global {
    namespace Il2Cpp {
        class Tracer extends Il2CppTracer {}
    }
}
