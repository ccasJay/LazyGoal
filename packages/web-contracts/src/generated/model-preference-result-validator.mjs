var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserModelPreferenceResult-validator.cjs
var require_BrowserModelPreferenceResult_validator = __commonJS({
  "BrowserModelPreferenceResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      const _errs1 = errors;
      let valid1 = false;
      const _errs2 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.ok === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.modelId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/required", keyword: "required", params: { missingProperty: "modelId" }, message: "must have required property 'modelId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "modelId")) {
            const err2 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err3 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (true !== data0) {
            const err4 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
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
              const err5 = { instancePath: instancePath + "/modelId", schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/properties/modelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          } else {
            const err6 = { instancePath: instancePath + "/modelId", schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      var _valid0 = _errs2 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs9 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err8 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err9 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err10 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data2 = data.ok;
            if (typeof data2 !== "boolean") {
              const err11 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (false !== data2) {
              const err12 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            if (typeof data.error !== "string") {
              const err13 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        } else {
          const err14 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        var _valid0 = _errs9 === errors;
        valid1 = valid1 || _valid0;
      }
      if (!valid1) {
        const err15 = { instancePath, schemaPath: "#/definitions/BrowserModelPreferenceResult/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      } else {
        errors = _errs1;
        if (vErrors !== null) {
          if (_errs1) {
            vErrors.length = _errs1;
          } else {
            vErrors = null;
          }
        }
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserModelPreferenceResult_validator();
