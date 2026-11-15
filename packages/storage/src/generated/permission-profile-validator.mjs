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

// PermissionProfileFile-validator.cjs
var require_PermissionProfileFile_validator = __commonJS({
  "PermissionProfileFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "version": { "type": "number", "const": 1 }, "workspaceId": { "type": "string", "minLength": 1 }, "sandbox": { "type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"] }, "approvals": { "type": "string", "enum": ["on-request", "never"] }, "reviewer": { "type": "string", "enum": ["user", "auto_review"] }, "writableRoots": { "type": "array", "items": { "type": "string" }, "description": "\u5DE5\u4F5C\u533A\u6811\u4E4B\u5916\u989D\u5916\u5141\u8BB8\u8BFB\u5199\u7684\u7EDD\u5BF9\u8DEF\u5F84\u6839\u76EE\u5F55\u3002" }, "revision": { "type": "integer", "minimum": 0 } }, "required": ["version", "workspaceId", "sandbox", "approvals", "reviewer", "writableRoots", "revision"], "additionalProperties": false, "description": "\u5DE5\u4F5C\u533A\u6743\u9650\u6863\u4F4D\u6587\u4EF6\u7684\u6301\u4E45\u5316 DTO\u3002" };
    var func2 = require_ucs2length().default;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.version === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.workspaceId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/required", keyword: "required", params: { missingProperty: "workspaceId" }, message: "must have required property 'workspaceId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.sandbox === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/required", keyword: "required", params: { missingProperty: "sandbox" }, message: "must have required property 'sandbox'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.approvals === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/required", keyword: "required", params: { missingProperty: "approvals" }, message: "must have required property 'approvals'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.reviewer === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/required", keyword: "required", params: { missingProperty: "reviewer" }, message: "must have required property 'reviewer'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.writableRoots === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/required", keyword: "required", params: { missingProperty: "writableRoots" }, message: "must have required property 'writableRoots'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.revision === void 0) {
          const err6 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "version" || key0 === "workspaceId" || key0 === "sandbox" || key0 === "approvals" || key0 === "reviewer" || key0 === "writableRoots" || key0 === "revision")) {
            const err7 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.version !== void 0) {
          let data0 = data.version;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err8 = { instancePath: instancePath + "/version", schemaPath: "#/definitions/PermissionProfileFile/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (1 !== data0) {
            const err9 = { instancePath: instancePath + "/version", schemaPath: "#/definitions/PermissionProfileFile/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.workspaceId !== void 0) {
          let data1 = data.workspaceId;
          if (typeof data1 === "string") {
            if (func2(data1) < 1) {
              const err10 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/definitions/PermissionProfileFile/properties/workspaceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/definitions/PermissionProfileFile/properties/workspaceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.sandbox !== void 0) {
          let data2 = data.sandbox;
          if (typeof data2 !== "string") {
            const err12 = { instancePath: instancePath + "/sandbox", schemaPath: "#/definitions/PermissionProfileFile/properties/sandbox/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (!(data2 === "read-only" || data2 === "workspace-write" || data2 === "danger-full-access")) {
            const err13 = { instancePath: instancePath + "/sandbox", schemaPath: "#/definitions/PermissionProfileFile/properties/sandbox/enum", keyword: "enum", params: { allowedValues: schema12.properties.sandbox.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.approvals !== void 0) {
          let data3 = data.approvals;
          if (typeof data3 !== "string") {
            const err14 = { instancePath: instancePath + "/approvals", schemaPath: "#/definitions/PermissionProfileFile/properties/approvals/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (!(data3 === "on-request" || data3 === "never")) {
            const err15 = { instancePath: instancePath + "/approvals", schemaPath: "#/definitions/PermissionProfileFile/properties/approvals/enum", keyword: "enum", params: { allowedValues: schema12.properties.approvals.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.reviewer !== void 0) {
          let data4 = data.reviewer;
          if (typeof data4 !== "string") {
            const err16 = { instancePath: instancePath + "/reviewer", schemaPath: "#/definitions/PermissionProfileFile/properties/reviewer/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data4 === "user" || data4 === "auto_review")) {
            const err17 = { instancePath: instancePath + "/reviewer", schemaPath: "#/definitions/PermissionProfileFile/properties/reviewer/enum", keyword: "enum", params: { allowedValues: schema12.properties.reviewer.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.writableRoots !== void 0) {
          let data5 = data.writableRoots;
          if (Array.isArray(data5)) {
            const len0 = data5.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data5[i0] !== "string") {
                const err18 = { instancePath: instancePath + "/writableRoots/" + i0, schemaPath: "#/definitions/PermissionProfileFile/properties/writableRoots/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/writableRoots", schemaPath: "#/definitions/PermissionProfileFile/properties/writableRoots/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data7 = data.revision;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err20 = { instancePath: instancePath + "/revision", schemaPath: "#/definitions/PermissionProfileFile/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 < 0 || isNaN(data7)) {
              const err21 = { instancePath: instancePath + "/revision", schemaPath: "#/definitions/PermissionProfileFile/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
      } else {
        const err22 = { instancePath, schemaPath: "#/definitions/PermissionProfileFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_PermissionProfileFile_validator();
