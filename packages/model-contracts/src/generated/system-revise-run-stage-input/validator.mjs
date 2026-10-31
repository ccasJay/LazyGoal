var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// SystemReviseRunStageInput-validator.cjs
var require_SystemReviseRunStageInput_validator = __commonJS({
  "SystemReviseRunStageInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.target === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/SystemReviseRunStageInput/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.acceptanceCriteria === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/SystemReviseRunStageInput/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.reason === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/SystemReviseRunStageInput/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "target" || key0 === "acceptanceCriteria" || key0 === "reason")) {
            const err3 = { instancePath, schemaPath: "#/definitions/SystemReviseRunStageInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.target !== void 0) {
          if (typeof data.target !== "string") {
            const err4 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/SystemReviseRunStageInput/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.acceptanceCriteria !== void 0) {
          let data1 = data.acceptanceCriteria;
          if (Array.isArray(data1)) {
            if (data1.length < 1) {
              const err5 = { instancePath: instancePath + "/acceptanceCriteria", schemaPath: "#/definitions/SystemReviseRunStageInput/properties/acceptanceCriteria/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data1[i0] !== "string") {
                const err6 = { instancePath: instancePath + "/acceptanceCriteria/" + i0, schemaPath: "#/definitions/SystemReviseRunStageInput/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
            }
          } else {
            const err7 = { instancePath: instancePath + "/acceptanceCriteria", schemaPath: "#/definitions/SystemReviseRunStageInput/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.reason !== void 0) {
          if (typeof data.reason !== "string") {
            const err8 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/SystemReviseRunStageInput/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/definitions/SystemReviseRunStageInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
export default require_SystemReviseRunStageInput_validator();
