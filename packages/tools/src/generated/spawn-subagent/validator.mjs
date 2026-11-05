var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// SpawnSubagentToolInput-validator.cjs
var require_SpawnSubagentToolInput_validator = __commonJS({
  "SpawnSubagentToolInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var func2 = require_ucs2length().default;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.intent === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/SpawnSubagentToolInput/required", keyword: "required", params: { missingProperty: "intent" }, message: "must have required property 'intent'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "intent" || key0 === "title")) {
            const err1 = { instancePath, schemaPath: "#/definitions/SpawnSubagentToolInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.intent !== void 0) {
          let data0 = data.intent;
          if (typeof data0 === "string") {
            if (func2(data0) < 1) {
              const err2 = { instancePath: instancePath + "/intent", schemaPath: "#/definitions/SpawnSubagentToolInput/properties/intent/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
          } else {
            const err3 = { instancePath: instancePath + "/intent", schemaPath: "#/definitions/SpawnSubagentToolInput/properties/intent/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.title !== void 0) {
          if (typeof data.title !== "string") {
            const err4 = { instancePath: instancePath + "/title", schemaPath: "#/definitions/SpawnSubagentToolInput/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
      } else {
        const err5 = { instancePath, schemaPath: "#/definitions/SpawnSubagentToolInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_SpawnSubagentToolInput_validator();
