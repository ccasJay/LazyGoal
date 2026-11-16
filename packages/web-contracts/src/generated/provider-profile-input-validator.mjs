var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserProviderProfileInput-validator.cjs
var require_BrowserProviderProfileInput_validator = __commonJS({
  "BrowserProviderProfileInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "label": { "type": "string", "pattern": "\\S" }, "kind": { "type": "string", "pattern": "\\S" }, "defaultModel": { "type": "string", "pattern": "\\S" }, "apiKey": { "type": "string", "pattern": "\\S" }, "baseURL": { "type": ["string", "null"], "pattern": "\\S" }, "contextWindowTokens": { "type": ["number", "null"], "maximum": 9007199254740991, "minimum": 1 }, "maxOutputTokens": { "type": ["number", "null"], "maximum": 9007199254740991, "minimum": 1 } }, "required": ["label", "kind", "defaultModel"], "additionalProperties": false, "description": "\u521B\u5EFA\u6216\u90E8\u5206\u66F4\u65B0\u6863\u6848\u7684\u8F93\u5165\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.label === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfileInput/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.kind === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfileInput/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.defaultModel === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfileInput/required", keyword: "required", params: { missingProperty: "defaultModel" }, message: "must have required property 'defaultModel'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "label" || key0 === "kind" || key0 === "defaultModel" || key0 === "apiKey" || key0 === "baseURL" || key0 === "contextWindowTokens" || key0 === "maxOutputTokens")) {
            const err3 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfileInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.label !== void 0) {
          let data0 = data.label;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err4 = { instancePath: instancePath + "/label", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/label/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/label", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data1 = data.kind;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err6 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/kind/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.defaultModel !== void 0) {
          let data2 = data.defaultModel;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err8 = { instancePath: instancePath + "/defaultModel", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/defaultModel/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/defaultModel", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/defaultModel/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.apiKey !== void 0) {
          let data3 = data.apiKey;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err10 = { instancePath: instancePath + "/apiKey", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/apiKey/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/apiKey", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/apiKey/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.baseURL !== void 0) {
          let data4 = data.baseURL;
          if (typeof data4 !== "string" && data4 !== null) {
            const err12 = { instancePath: instancePath + "/baseURL", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/baseURL/type", keyword: "type", params: { type: schema12.properties.baseURL.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (typeof data4 === "string") {
            if (!pattern0.test(data4)) {
              const err13 = { instancePath: instancePath + "/baseURL", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/baseURL/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        }
        if (data.contextWindowTokens !== void 0) {
          let data5 = data.contextWindowTokens;
          if (!(typeof data5 == "number" && isFinite(data5)) && data5 !== null) {
            const err14 = { instancePath: instancePath + "/contextWindowTokens", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/contextWindowTokens/type", keyword: "type", params: { type: schema12.properties.contextWindowTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 > 9007199254740991 || isNaN(data5)) {
              const err15 = { instancePath: instancePath + "/contextWindowTokens", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/contextWindowTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data5 < 1 || isNaN(data5)) {
              const err16 = { instancePath: instancePath + "/contextWindowTokens", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/contextWindowTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        }
        if (data.maxOutputTokens !== void 0) {
          let data6 = data.maxOutputTokens;
          if (!(typeof data6 == "number" && isFinite(data6)) && data6 !== null) {
            const err17 = { instancePath: instancePath + "/maxOutputTokens", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/maxOutputTokens/type", keyword: "type", params: { type: schema12.properties.maxOutputTokens.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err18 = { instancePath: instancePath + "/maxOutputTokens", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/maxOutputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data6 < 1 || isNaN(data6)) {
              const err19 = { instancePath: instancePath + "/maxOutputTokens", schemaPath: "#/definitions/BrowserProviderProfileInput/properties/maxOutputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfileInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserProviderProfileInput_validator();
