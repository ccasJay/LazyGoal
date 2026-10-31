var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserModelSelectionCommand-validator.cjs
var require_BrowserModelSelectionCommand_validator = __commonJS({
  "BrowserModelSelectionCommand-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.runId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionCommand/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.modelId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionCommand/required", keyword: "required", params: { missingProperty: "modelId" }, message: "must have required property 'modelId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "runId" || key0 === "modelId" || key0 === "providerProfileId")) {
            const err2 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionCommand/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
              const err3 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserModelSelectionCommand/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
          } else {
            const err4 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserModelSelectionCommand/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.modelId !== void 0) {
          let data1 = data.modelId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err5 = { instancePath: instancePath + "/modelId", schemaPath: "#/definitions/BrowserModelSelectionCommand/properties/modelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          } else {
            const err6 = { instancePath: instancePath + "/modelId", schemaPath: "#/definitions/BrowserModelSelectionCommand/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.providerProfileId !== void 0) {
          let data2 = data.providerProfileId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err7 = { instancePath: instancePath + "/providerProfileId", schemaPath: "#/definitions/BrowserModelSelectionCommand/properties/providerProfileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/providerProfileId", schemaPath: "#/definitions/BrowserModelSelectionCommand/properties/providerProfileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionCommand/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
export default require_BrowserModelSelectionCommand_validator();
