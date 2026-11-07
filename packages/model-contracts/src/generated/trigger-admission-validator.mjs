var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// TriggerAdmissionDecision-validator.cjs
var require_TriggerAdmissionDecision_validator = __commonJS({
  "TriggerAdmissionDecision-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "kind": { "type": "string", "enum": ["accept", "ignore"] }, "intent": { "type": "string" } }, "required": ["kind", "intent"], "additionalProperties": false, "description": "Supervisor \u5BF9\u5DE5\u4F5C Trigger \u7684\u6A21\u578B\u51C6\u5165\u7ED3\u679C\u3002" };
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/TriggerAdmissionDecision/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.intent === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/TriggerAdmissionDecision/required", keyword: "required", params: { missingProperty: "intent" }, message: "must have required property 'intent'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "intent")) {
            const err2 = { instancePath, schemaPath: "#/definitions/TriggerAdmissionDecision/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerAdmissionDecision/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (!(data0 === "accept" || data0 === "ignore")) {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerAdmissionDecision/properties/kind/enum", keyword: "enum", params: { allowedValues: schema12.properties.kind.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.intent !== void 0) {
          if (typeof data.intent !== "string") {
            const err5 = { instancePath: instancePath + "/intent", schemaPath: "#/definitions/TriggerAdmissionDecision/properties/intent/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/definitions/TriggerAdmissionDecision/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_TriggerAdmissionDecision_validator();
