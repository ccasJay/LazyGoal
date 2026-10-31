var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// AcceptedCommand-validator.cjs
var require_AcceptedCommand_validator = __commonJS({
  "AcceptedCommand-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/AcceptedCommand/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/AcceptedCommand/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.existing === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/AcceptedCommand/required", keyword: "required", params: { missingProperty: "existing" }, message: "must have required property 'existing'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goalId" || key0 === "runId" || key0 === "existing")) {
            const err3 = { instancePath, schemaPath: "#/definitions/AcceptedCommand/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err4 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/AcceptedCommand/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/AcceptedCommand/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data1 = data.runId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err6 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/AcceptedCommand/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/AcceptedCommand/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.existing !== void 0) {
          if (typeof data.existing !== "boolean") {
            const err8 = { instancePath: instancePath + "/existing", schemaPath: "#/definitions/AcceptedCommand/properties/existing/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/definitions/AcceptedCommand/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
export default require_AcceptedCommand_validator();
