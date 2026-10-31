var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// SystemCompletionReviewInput-validator.cjs
var require_SystemCompletionReviewInput_validator = __commonJS({
  "SystemCompletionReviewInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/CompletionReviewAccept/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind")) {
            const err1 = { instancePath, schemaPath: "#/definitions/CompletionReviewAccept/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err2 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/CompletionReviewAccept/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
          if ("accept" !== data0) {
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/CompletionReviewAccept/properties/kind/const", keyword: "const", params: { allowedValue: "accept" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
      } else {
        const err4 = { instancePath, schemaPath: "#/definitions/CompletionReviewAccept/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs7 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err5 = { instancePath, schemaPath: "#/definitions/CompletionReviewReject/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (data.feedback === void 0) {
            const err6 = { instancePath, schemaPath: "#/definitions/CompletionReviewReject/required", keyword: "required", params: { missingProperty: "feedback" }, message: "must have required property 'feedback'" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "feedback")) {
              const err7 = { instancePath, schemaPath: "#/definitions/CompletionReviewReject/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data1 = data.kind;
            if (typeof data1 !== "string") {
              const err8 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/CompletionReviewReject/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if ("reject" !== data1) {
              const err9 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/CompletionReviewReject/properties/kind/const", keyword: "const", params: { allowedValue: "reject" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          if (data.feedback !== void 0) {
            if (typeof data.feedback !== "string") {
              const err10 = { instancePath: instancePath + "/feedback", schemaPath: "#/definitions/CompletionReviewReject/properties/feedback/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        } else {
          const err11 = { instancePath, schemaPath: "#/definitions/CompletionReviewReject/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        var _valid0 = _errs7 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err12 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.result === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "result")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.result !== void 0) {
          if (!validate12(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      validate11.errors = vErrors;
      return errors === 0;
    }
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (!validate11(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
        errors = vErrors.length;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_SystemCompletionReviewInput_validator();
