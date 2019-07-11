#!/usr/bin/env ts-node

import * as fs from "fs";

import {
    InputData,
    JavaTargetLanguage,
    JSONSchema,
    JSONSchemaAttributes,
    JSONSchemaInput,
    JSONSchemaType,
    quicktype,
    Ref,
    TypeAttributeKind,
    RenderContext, JavaRenderer, getOptionValues, javaOptions, TargetLanguage, Name, ClassType, ClassProperty
} from "quicktype/dist/quicktype-core";
import {OptionValues} from "quicktype/dist/quicktype-core/RendererOptions";

/**
 * This type attribute stores information on types related to our game object domain.
 * Right now the only piece of information we store is whether a class must be a
 * subclass of GameObject, for which we only need a boolean.
 */
class DeprecatedTypeAttributeKind extends TypeAttributeKind<boolean> {
    constructor() {
        // This name is used only for debugging purposes.
        super("deprecated");
    }

    // When two classes are combined, such as in a `oneOf` schema, the resulting
    // class is a game object if at least one of the constituent classes is a game
    // object.
    combine(attrs: boolean[]): boolean {
        return attrs.some(x => x);
    }

    // Type attributes are made inferred in cases where the given type
    // participates in a union with other non-class types, for examples.  In
    // those cases, the union type does not get the attribute at all.
    makeInferred(_: boolean): undefined {
        return undefined;
    }

    // For debugging purposes only.  It shows up when quicktype is run with
    // with the `debugPrintGraph` option.
    stringify(isDeprecated: boolean): string {
        return isDeprecated.toString();
    }
}

// We need to instantiate the attribute kind class to work with it.
const deprecatedTypeAttributeKind = new DeprecatedTypeAttributeKind();

/**
 * This function produces, wherever appropriate, a game object type attribute
 * for a given schema type.  We do this for all object types, whether the
 * `gameObject` property is present in the schema or not (if it's not present,
 * the attribute will be `false`).  If it's present, it must be a boolean.
 */
function deprecatedAttributeProducer(
    schema: JSONSchema,
    canonicalRef: Ref,
    _types: Set<JSONSchemaType>
): JSONSchemaAttributes | undefined {
    // booleans are valid JSON Schemas, too, but we won't produce our
    // attribute for them.
    if (typeof schema !== "object") return undefined;

    let isDeprecated: boolean;
    if (schema.deprecated === undefined) {
        isDeprecated = false;
    } else if (typeof schema.deprecated === "boolean") {
        isDeprecated = schema.deprecated;
    } else {
        throw new Error(`deprecated is not a boolean in ${canonicalRef}`);
    }

    return { forType: deprecatedTypeAttributeKind.makeAttributes(isDeprecated) };
}

export class CustomJava extends JavaTargetLanguage {
    protected makeRenderer(renderContext: RenderContext, untypedOptionValues: { [name: string]: any }): JavaRenderer {
        return new CustomizedJavaRenderer(this, renderContext, getOptionValues(javaOptions, untypedOptionValues));
    }
}

export class CustomizedJavaRenderer extends JavaRenderer {

    constructor(
        targetLanguage: TargetLanguage,
        renderContext: RenderContext,
        _options: OptionValues<typeof javaOptions>
    ) {
        super(targetLanguage, renderContext, _options);
    }

    protected emitAccessorAttributes(
        c: ClassType,
        className: Name,
        propertyName: Name,
        jsonName: string,
        p: ClassProperty,
        isSetter: boolean
    ): void {
        const attributes = p.type.getAttributes();
        const deprecated = deprecatedTypeAttributeKind.tryGetInAttributes(attributes);
        if(deprecated) {
            this.emitLine("@Deprecated");
        }
        super.emitAccessorAttributes(
            c,
            className,
            propertyName,
            jsonName,
            p,
            isSetter
        );
    }
}

async function main(program: string, args: string[]): Promise<void> {
    if (args.length !== 1) {
        console.error(`Usage: ${program} SCHEMA`);
        process.exit(1);
    }

    const inputData = new InputData();
    const source = { name: "Player", schema: fs.readFileSync(args[0], "utf8") };

    // We need to pass the attribute producer to the JSONSchemaInput
    const producers = [deprecatedAttributeProducer];
    await inputData.addSource("schema", source, () => new JSONSchemaInput(undefined, producers));

    const lang = new CustomJava();

    const { lines } = await quicktype({ lang, inputData });

    for (const line of lines) {
        console.log(line);
    }
}

main(process.argv[1], process.argv.slice(2)).catch(e => {
    console.error(e);
    process.exit(1);
});
