var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// SupervisorPermissionDecisionWire-validator.cjs
var require_SupervisorPermissionDecisionWire_validator = __commonJS({
  "SupervisorPermissionDecisionWire-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "kind": { "type": "string", "enum": ["approve", "reject"], "description": "\u7531\u6D88\u8D39\u7AEF\u7ED3\u5408 `reason` \u6821\u9A8C\u7684\u51B3\u5B9A\u79CD\u7C7B\u3002" }, "reason": { "type": ["string", "null"], "description": "`approve` \u5FC5\u987B\u4E3A `null`\uFF1B`reject` \u5FC5\u987B\u4E3A\u975E\u7A7A\u539F\u56E0\u3002" } }, "required": ["kind", "reason"], "additionalProperties": false, "description": "Supervisor \u6743\u9650\u5224\u65AD\u5728 JSON Schema \u8FB9\u754C\u4F7F\u7528\u7684\u53EF\u79FB\u690D\u7ED3\u6784\u3002" };
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/SupervisorPermissionDecisionWire/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.reason === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/SupervisorPermissionDecisionWire/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "reason")) {
            const err2 = { instancePath, schemaPath: "#/definitions/SupervisorPermissionDecisionWire/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/SupervisorPermissionDecisionWire/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (!(data0 === "approve" || data0 === "reject")) {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/SupervisorPermissionDecisionWire/properties/kind/enum", keyword: "enum", params: { allowedValues: schema12.properties.kind.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.reason !== void 0) {
          let data1 = data.reason;
          if (typeof data1 !== "string" && data1 !== null) {
            const err5 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/SupervisorPermissionDecisionWire/properties/reason/type", keyword: "type", params: { type: schema12.properties.reason.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/definitions/SupervisorPermissionDecisionWire/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
export default require_SupervisorPermissionDecisionWire_validator();
