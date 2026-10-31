var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserToolGrantRevokeBody-validator.cjs
var require_BrowserToolGrantRevokeBody_validator = __commonJS({
  "BrowserToolGrantRevokeBody-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "runId": { "type": "string", "pattern": "\\S" }, "scope": { "type": "string", "enum": ["goal", "workspace"] }, "kind": { "type": "string", "enum": ["tool", "sandbox"] } }, "required": ["runId", "scope"], "additionalProperties": false, "description": "\u64A4\u9500\u5DE5\u5177\u6388\u6743\u8BF7\u6C42\u4F53\uFF1B`grantId` \u53EA\u6765\u81EA\u8DEF\u5F84\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.runId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserToolGrantRevokeBody/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.scope === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserToolGrantRevokeBody/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "runId" || key0 === "scope" || key0 === "kind")) {
            const err2 = { instancePath, schemaPath: "#/definitions/BrowserToolGrantRevokeBody/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data0 = data.runId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err3 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserToolGrantRevokeBody/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
          } else {
            const err4 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserToolGrantRevokeBody/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data1 = data.scope;
          if (typeof data1 !== "string") {
            const err5 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserToolGrantRevokeBody/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (!(data1 === "goal" || data1 === "workspace")) {
            const err6 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserToolGrantRevokeBody/properties/scope/enum", keyword: "enum", params: { allowedValues: schema12.properties.scope.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data2 = data.kind;
          if (typeof data2 !== "string") {
            const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserToolGrantRevokeBody/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data2 === "tool" || data2 === "sandbox")) {
            const err8 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserToolGrantRevokeBody/properties/kind/enum", keyword: "enum", params: { allowedValues: schema12.properties.kind.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/definitions/BrowserToolGrantRevokeBody/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserToolGrantRevokeBody_validator();
