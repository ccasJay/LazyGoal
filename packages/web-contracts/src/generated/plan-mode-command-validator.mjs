var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserGoalPlanModeCommand-validator.cjs
var require_BrowserGoalPlanModeCommand_validator = __commonJS({
  "BrowserGoalPlanModeCommand-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.runId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserGoalPlanModeCommand/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "runId")) {
            const err1 = { instancePath, schemaPath: "#/definitions/BrowserGoalPlanModeCommand/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data0 = data.runId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err2 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserGoalPlanModeCommand/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
          } else {
            const err3 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserGoalPlanModeCommand/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
      } else {
        const err4 = { instancePath, schemaPath: "#/definitions/BrowserGoalPlanModeCommand/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserGoalPlanModeCommand_validator();
