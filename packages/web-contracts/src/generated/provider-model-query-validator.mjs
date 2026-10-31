var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserProviderModelQuery-validator.cjs
var require_BrowserProviderModelQuery_validator = __commonJS({
  "BrowserProviderModelQuery-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserProviderModelQuery/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "apiKey" || key0 === "baseURL" || key0 === "profileId")) {
            const err1 = { instancePath, schemaPath: "#/definitions/BrowserProviderModelQuery/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err2 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/kind/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
          } else {
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.apiKey !== void 0) {
          let data1 = data.apiKey;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err4 = { instancePath: instancePath + "/apiKey", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/apiKey/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/apiKey", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/apiKey/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.baseURL !== void 0) {
          let data2 = data.baseURL;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err6 = { instancePath: instancePath + "/baseURL", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/baseURL/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/baseURL", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/baseURL/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.profileId !== void 0) {
          let data3 = data.profileId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err8 = { instancePath: instancePath + "/profileId", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/profileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/profileId", schemaPath: "#/definitions/BrowserProviderModelQuery/properties/profileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
      } else {
        const err10 = { instancePath, schemaPath: "#/definitions/BrowserProviderModelQuery/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserProviderModelQuery_validator();
