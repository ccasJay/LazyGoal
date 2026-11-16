var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserProviderProfile-validator.cjs
var require_BrowserProviderProfile_validator = __commonJS({
  "BrowserProviderProfile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "id": { "type": "string", "pattern": "\\S" }, "label": { "type": "string", "pattern": "\\S" }, "kind": { "type": "string", "pattern": "\\S" }, "defaultModel": { "type": "string", "pattern": "\\S" }, "baseURL": { "type": "string" }, "contextWindowTokens": { "type": "number" }, "maxOutputTokens": { "type": "number" }, "hasApiKey": { "type": "boolean" }, "apiKeyMask": { "type": "string" } }, "required": ["id", "label", "kind", "defaultModel", "hasApiKey", "apiKeyMask"], "additionalProperties": false, "description": "\u53D7\u7BA1 Provider \u6863\u6848\u7684\u975E\u654F\u611F\u6295\u5F71\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.id === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.label === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.kind === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.defaultModel === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "defaultModel" }, message: "must have required property 'defaultModel'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.hasApiKey === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "hasApiKey" }, message: "must have required property 'hasApiKey'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.apiKeyMask === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "apiKeyMask" }, message: "must have required property 'apiKeyMask'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err6 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          let data0 = data.id;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err7 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/BrowserProviderProfile/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/BrowserProviderProfile/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.label !== void 0) {
          let data1 = data.label;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err9 = { instancePath: instancePath + "/label", schemaPath: "#/definitions/BrowserProviderProfile/properties/label/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/label", schemaPath: "#/definitions/BrowserProviderProfile/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data2 = data.kind;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserProviderProfile/properties/kind/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserProviderProfile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.defaultModel !== void 0) {
          let data3 = data.defaultModel;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err13 = { instancePath: instancePath + "/defaultModel", schemaPath: "#/definitions/BrowserProviderProfile/properties/defaultModel/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/defaultModel", schemaPath: "#/definitions/BrowserProviderProfile/properties/defaultModel/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.baseURL !== void 0) {
          if (typeof data.baseURL !== "string") {
            const err15 = { instancePath: instancePath + "/baseURL", schemaPath: "#/definitions/BrowserProviderProfile/properties/baseURL/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.contextWindowTokens !== void 0) {
          let data5 = data.contextWindowTokens;
          if (!(typeof data5 == "number" && isFinite(data5))) {
            const err16 = { instancePath: instancePath + "/contextWindowTokens", schemaPath: "#/definitions/BrowserProviderProfile/properties/contextWindowTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.maxOutputTokens !== void 0) {
          let data6 = data.maxOutputTokens;
          if (!(typeof data6 == "number" && isFinite(data6))) {
            const err17 = { instancePath: instancePath + "/maxOutputTokens", schemaPath: "#/definitions/BrowserProviderProfile/properties/maxOutputTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.hasApiKey !== void 0) {
          if (typeof data.hasApiKey !== "boolean") {
            const err18 = { instancePath: instancePath + "/hasApiKey", schemaPath: "#/definitions/BrowserProviderProfile/properties/hasApiKey/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.apiKeyMask !== void 0) {
          if (typeof data.apiKeyMask !== "string") {
            const err19 = { instancePath: instancePath + "/apiKeyMask", schemaPath: "#/definitions/BrowserProviderProfile/properties/apiKeyMask/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/definitions/BrowserProviderProfile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
export default require_BrowserProviderProfile_validator();
