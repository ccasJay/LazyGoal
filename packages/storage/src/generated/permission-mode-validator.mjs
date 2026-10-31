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

// PermissionModeFile-validator.cjs
var require_PermissionModeFile_validator = __commonJS({
  "PermissionModeFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "version": { "type": "number", "const": 1 }, "workspaceId": { "type": "string", "minLength": 1 }, "mode": { "type": "string", "enum": ["default", "yolo"] }, "revision": { "type": "integer", "minimum": 0 } }, "required": ["version", "workspaceId", "mode", "revision"], "additionalProperties": false, "description": "\u9879\u76EE\u6743\u9650\u6A21\u5F0F\u6587\u4EF6\u7684\u6301\u4E45\u5316 DTO\u3002" };
    var func2 = require_ucs2length().default;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.version === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/PermissionModeFile/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.workspaceId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/PermissionModeFile/required", keyword: "required", params: { missingProperty: "workspaceId" }, message: "must have required property 'workspaceId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.mode === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/PermissionModeFile/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.revision === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/PermissionModeFile/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "version" || key0 === "workspaceId" || key0 === "mode" || key0 === "revision")) {
            const err4 = { instancePath, schemaPath: "#/definitions/PermissionModeFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.version !== void 0) {
          let data0 = data.version;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err5 = { instancePath: instancePath + "/version", schemaPath: "#/definitions/PermissionModeFile/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (1 !== data0) {
            const err6 = { instancePath: instancePath + "/version", schemaPath: "#/definitions/PermissionModeFile/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.workspaceId !== void 0) {
          let data1 = data.workspaceId;
          if (typeof data1 === "string") {
            if (func2(data1) < 1) {
              const err7 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/definitions/PermissionModeFile/properties/workspaceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/definitions/PermissionModeFile/properties/workspaceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.mode !== void 0) {
          let data2 = data.mode;
          if (typeof data2 !== "string") {
            const err9 = { instancePath: instancePath + "/mode", schemaPath: "#/definitions/PermissionModeFile/properties/mode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (!(data2 === "default" || data2 === "yolo")) {
            const err10 = { instancePath: instancePath + "/mode", schemaPath: "#/definitions/PermissionModeFile/properties/mode/enum", keyword: "enum", params: { allowedValues: schema12.properties.mode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data3 = data.revision;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err11 = { instancePath: instancePath + "/revision", schemaPath: "#/definitions/PermissionModeFile/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 < 0 || isNaN(data3)) {
              const err12 = { instancePath: instancePath + "/revision", schemaPath: "#/definitions/PermissionModeFile/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/definitions/PermissionModeFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_PermissionModeFile_validator();
