import { checkNull, injectToIl2Cpp } from "../decorators";
import { readFieldValue, writeFieldValue } from "../utils";

import { NativeStruct } from "../../utils/native-struct";

@injectToIl2Cpp("Reference")
class Il2CppReference<T extends Il2Cpp.Field.Type = Il2Cpp.Field.Type> extends NativeStruct {
    constructor(handle: NativePointer, readonly type: Il2Cpp.Type) {
        super(handle);
    }

    get value(): T {
        return readFieldValue(this.handle, this.type) as T;
    }

    set value(value: T) {
        writeFieldValue(this.handle, value, this.type);
    }

    @checkNull
    override toString(): string {
        return `->${this.value}`;
    }
}