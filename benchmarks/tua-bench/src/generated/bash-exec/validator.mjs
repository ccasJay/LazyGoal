var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BashExecInput-validator.cjs
var require_BashExecInput_validator = __commonJS({
  "BashExecInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.command === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BashExecInput/required", keyword: "required", params: { missingProperty: "command" }, message: "must have required property 'command'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "command" || key0 === "timeoutMs" || key0 === "workdir")) {
            const err1 = { instancePath, schemaPath: "#/definitions/BashExecInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.command !== void 0) {
          if (typeof data.command !== "string") {
            const err2 = { instancePath: instancePath + "/command", schemaPath: "#/definitions/BashExecInput/properties/command/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.timeoutMs !== void 0) {
          let data1 = data.timeoutMs;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err3 = { instancePath: instancePath + "/timeoutMs", schemaPath: "#/definitions/BashExecInput/properties/timeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 6e5 || isNaN(data1)) {
              const err4 = { instancePath: instancePath + "/timeoutMs", schemaPath: "#/definitions/BashExecInput/properties/timeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 6e5 }, message: "must be <= 600000" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err5 = { instancePath: instancePath + "/timeoutMs", schemaPath: "#/definitions/BashExecInput/properties/timeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
        }
        if (data.workdir !== void 0) {
          if (typeof data.workdir !== "string") {
            const err6 = { instancePath: instancePath + "/workdir", schemaPath: "#/definitions/BashExecInput/properties/workdir/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = { instancePath, schemaPath: "#/definitions/BashExecInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BashExecInput_validator();
