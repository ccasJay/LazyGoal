var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserProviderProfileWriteResult-validator.cjs
var require_BrowserProviderProfileWriteResult_validator = __commonJS({
  "BrowserProviderProfileWriteResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "id": { "type": "string", "pattern": "\\S" }, "label": { "type": "string", "pattern": "\\S" }, "kind": { "type": "string", "pattern": "\\S" }, "defaultModel": { "type": "string", "pattern": "\\S" }, "baseURL": { "type": "string" }, "contextWindowTokens": { "type": "number" }, "maxOutputTokens": { "type": "number" }, "hasApiKey": { "type": "boolean" }, "apiKeyMask": { "type": "string" } }, "required": ["id", "label", "kind", "defaultModel", "hasApiKey", "apiKeyMask"], "additionalProperties": false, "description": "\u53D7\u7BA1 Provider \u6863\u6848\u7684\u975E\u654F\u611F\u6295\u5F71\u3002" };
    var schema14 = { "type": "string", "enum": ["provider_profile_not_found", "provider_profile_conflict", "provider_profile_active", "provider_profile_invalid", "provider_profile_unavailable"], "description": "\u8BBE\u7F6E\u64CD\u4F5C\u7684\u7A33\u5B9A\u5931\u8D25\u5206\u7C7B\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.ok === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.profile === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "profile" }, message: "must have required property 'profile'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "profile")) {
            const err2 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
            const err3 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (true !== data0) {
            const err4 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.profile !== void 0) {
          let data1 = data.profile;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.id === void 0) {
              const err5 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data1.label === void 0) {
              const err6 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data1.kind === void 0) {
              const err7 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (data1.defaultModel === void 0) {
              const err8 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "defaultModel" }, message: "must have required property 'defaultModel'" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data1.hasApiKey === void 0) {
              const err9 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "hasApiKey" }, message: "must have required property 'hasApiKey'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data1.apiKeyMask === void 0) {
              const err10 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "apiKeyMask" }, message: "must have required property 'apiKeyMask'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!func2.call(schema13.properties, key1)) {
                const err11 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data1.id !== void 0) {
              let data2 = data1.id;
              if (typeof data2 === "string") {
                if (!pattern0.test(data2)) {
                  const err12 = { instancePath: instancePath + "/profile/id", schemaPath: "#/definitions/BrowserProviderProfile/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              } else {
                const err13 = { instancePath: instancePath + "/profile/id", schemaPath: "#/definitions/BrowserProviderProfile/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data1.label !== void 0) {
              let data3 = data1.label;
              if (typeof data3 === "string") {
                if (!pattern0.test(data3)) {
                  const err14 = { instancePath: instancePath + "/profile/label", schemaPath: "#/definitions/BrowserProviderProfile/properties/label/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              } else {
                const err15 = { instancePath: instancePath + "/profile/label", schemaPath: "#/definitions/BrowserProviderProfile/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data1.kind !== void 0) {
              let data4 = data1.kind;
              if (typeof data4 === "string") {
                if (!pattern0.test(data4)) {
                  const err16 = { instancePath: instancePath + "/profile/kind", schemaPath: "#/definitions/BrowserProviderProfile/properties/kind/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              } else {
                const err17 = { instancePath: instancePath + "/profile/kind", schemaPath: "#/definitions/BrowserProviderProfile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data1.defaultModel !== void 0) {
              let data5 = data1.defaultModel;
              if (typeof data5 === "string") {
                if (!pattern0.test(data5)) {
                  const err18 = { instancePath: instancePath + "/profile/defaultModel", schemaPath: "#/definitions/BrowserProviderProfile/properties/defaultModel/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
              } else {
                const err19 = { instancePath: instancePath + "/profile/defaultModel", schemaPath: "#/definitions/BrowserProviderProfile/properties/defaultModel/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data1.baseURL !== void 0) {
              if (typeof data1.baseURL !== "string") {
                const err20 = { instancePath: instancePath + "/profile/baseURL", schemaPath: "#/definitions/BrowserProviderProfile/properties/baseURL/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data1.contextWindowTokens !== void 0) {
              let data7 = data1.contextWindowTokens;
              if (!(typeof data7 == "number" && isFinite(data7))) {
                const err21 = { instancePath: instancePath + "/profile/contextWindowTokens", schemaPath: "#/definitions/BrowserProviderProfile/properties/contextWindowTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data1.maxOutputTokens !== void 0) {
              let data8 = data1.maxOutputTokens;
              if (!(typeof data8 == "number" && isFinite(data8))) {
                const err22 = { instancePath: instancePath + "/profile/maxOutputTokens", schemaPath: "#/definitions/BrowserProviderProfile/properties/maxOutputTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data1.hasApiKey !== void 0) {
              if (typeof data1.hasApiKey !== "boolean") {
                const err23 = { instancePath: instancePath + "/profile/hasApiKey", schemaPath: "#/definitions/BrowserProviderProfile/properties/hasApiKey/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data1.apiKeyMask !== void 0) {
              if (typeof data1.apiKeyMask !== "string") {
                const err24 = { instancePath: instancePath + "/profile/apiKeyMask", schemaPath: "#/definitions/BrowserProviderProfile/properties/apiKeyMask/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
          } else {
            const err25 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserProviderProfile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
      } else {
        const err26 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs28 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err27 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err28 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          for (const key2 in data) {
            if (!(key2 === "ok" || key2 === "error" || key2 === "fields")) {
              const err29 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data11 = data.ok;
            if (typeof data11 !== "boolean") {
              const err30 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            if (false !== data11) {
              const err31 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data12 = data.error;
            if (typeof data12 !== "string") {
              const err32 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserProviderSettingsError/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
            if (!(data12 === "provider_profile_not_found" || data12 === "provider_profile_conflict" || data12 === "provider_profile_active" || data12 === "provider_profile_invalid" || data12 === "provider_profile_unavailable")) {
              const err33 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserProviderSettingsError/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          }
          if (data.fields !== void 0) {
            let data13 = data.fields;
            if (Array.isArray(data13)) {
              const len0 = data13.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data13[i0] !== "string") {
                  const err34 = { instancePath: instancePath + "/fields/" + i0, schemaPath: "#/anyOf/1/properties/fields/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
              }
            } else {
              const err35 = { instancePath: instancePath + "/fields", schemaPath: "#/anyOf/1/properties/fields/type", keyword: "type", params: { type: "array" }, message: "must be array" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        } else {
          const err36 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err36];
          } else {
            vErrors.push(err36);
          }
          errors++;
        }
        var _valid0 = _errs28 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err37 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
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
export default require_BrowserProviderProfileWriteResult_validator();
