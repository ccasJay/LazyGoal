var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserProviderSettings-validator.cjs
var require_BrowserProviderSettings_validator = __commonJS({
  "BrowserProviderSettings-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "id": { "type": "string", "pattern": "\\S" }, "label": { "type": "string", "pattern": "\\S" }, "kind": { "type": "string", "pattern": "\\S" }, "defaultModel": { "type": "string", "pattern": "\\S" }, "baseURL": { "type": "string" }, "contextWindowTokens": { "type": "number" }, "maxOutputTokens": { "type": "number" }, "hasApiKey": { "type": "boolean" }, "apiKeyMask": { "type": "string" } }, "required": ["id", "label", "kind", "defaultModel", "hasApiKey", "apiKeyMask"], "additionalProperties": false, "description": "\u53D7\u7BA1 Provider \u6863\u6848\u7684\u975E\u654F\u611F\u6295\u5F71\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var func2 = Object.prototype.hasOwnProperty;
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.profiles === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "profiles" }, message: "must have required property 'profiles'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "activeProfileId" || key0 === "profiles" || key0 === "fallback")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.activeProfileId !== void 0) {
          let data0 = data.activeProfileId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err2 = { instancePath: instancePath + "/activeProfileId", schemaPath: "#/properties/activeProfileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
          } else {
            const err3 = { instancePath: instancePath + "/activeProfileId", schemaPath: "#/properties/activeProfileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.profiles !== void 0) {
          let data1 = data.profiles;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                if (data2.id === void 0) {
                  const err4 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (data2.label === void 0) {
                  const err5 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                if (data2.kind === void 0) {
                  const err6 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                if (data2.defaultModel === void 0) {
                  const err7 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "defaultModel" }, message: "must have required property 'defaultModel'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data2.hasApiKey === void 0) {
                  const err8 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "hasApiKey" }, message: "must have required property 'hasApiKey'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                if (data2.apiKeyMask === void 0) {
                  const err9 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/required", keyword: "required", params: { missingProperty: "apiKeyMask" }, message: "must have required property 'apiKeyMask'" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!func2.call(schema13.properties, key1)) {
                    const err10 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                }
                if (data2.id !== void 0) {
                  let data3 = data2.id;
                  if (typeof data3 === "string") {
                    if (!pattern0.test(data3)) {
                      const err11 = { instancePath: instancePath + "/profiles/" + i0 + "/id", schemaPath: "#/definitions/BrowserProviderProfile/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err11];
                      } else {
                        vErrors.push(err11);
                      }
                      errors++;
                    }
                  } else {
                    const err12 = { instancePath: instancePath + "/profiles/" + i0 + "/id", schemaPath: "#/definitions/BrowserProviderProfile/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
                if (data2.label !== void 0) {
                  let data4 = data2.label;
                  if (typeof data4 === "string") {
                    if (!pattern0.test(data4)) {
                      const err13 = { instancePath: instancePath + "/profiles/" + i0 + "/label", schemaPath: "#/definitions/BrowserProviderProfile/properties/label/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err13];
                      } else {
                        vErrors.push(err13);
                      }
                      errors++;
                    }
                  } else {
                    const err14 = { instancePath: instancePath + "/profiles/" + i0 + "/label", schemaPath: "#/definitions/BrowserProviderProfile/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                }
                if (data2.kind !== void 0) {
                  let data5 = data2.kind;
                  if (typeof data5 === "string") {
                    if (!pattern0.test(data5)) {
                      const err15 = { instancePath: instancePath + "/profiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserProviderProfile/properties/kind/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err15];
                      } else {
                        vErrors.push(err15);
                      }
                      errors++;
                    }
                  } else {
                    const err16 = { instancePath: instancePath + "/profiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserProviderProfile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
                if (data2.defaultModel !== void 0) {
                  let data6 = data2.defaultModel;
                  if (typeof data6 === "string") {
                    if (!pattern0.test(data6)) {
                      const err17 = { instancePath: instancePath + "/profiles/" + i0 + "/defaultModel", schemaPath: "#/definitions/BrowserProviderProfile/properties/defaultModel/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err17];
                      } else {
                        vErrors.push(err17);
                      }
                      errors++;
                    }
                  } else {
                    const err18 = { instancePath: instancePath + "/profiles/" + i0 + "/defaultModel", schemaPath: "#/definitions/BrowserProviderProfile/properties/defaultModel/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                }
                if (data2.baseURL !== void 0) {
                  if (typeof data2.baseURL !== "string") {
                    const err19 = { instancePath: instancePath + "/profiles/" + i0 + "/baseURL", schemaPath: "#/definitions/BrowserProviderProfile/properties/baseURL/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data2.contextWindowTokens !== void 0) {
                  let data8 = data2.contextWindowTokens;
                  if (!(typeof data8 == "number" && isFinite(data8))) {
                    const err20 = { instancePath: instancePath + "/profiles/" + i0 + "/contextWindowTokens", schemaPath: "#/definitions/BrowserProviderProfile/properties/contextWindowTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                }
                if (data2.maxOutputTokens !== void 0) {
                  let data9 = data2.maxOutputTokens;
                  if (!(typeof data9 == "number" && isFinite(data9))) {
                    const err21 = { instancePath: instancePath + "/profiles/" + i0 + "/maxOutputTokens", schemaPath: "#/definitions/BrowserProviderProfile/properties/maxOutputTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                }
                if (data2.hasApiKey !== void 0) {
                  if (typeof data2.hasApiKey !== "boolean") {
                    const err22 = { instancePath: instancePath + "/profiles/" + i0 + "/hasApiKey", schemaPath: "#/definitions/BrowserProviderProfile/properties/hasApiKey/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                }
                if (data2.apiKeyMask !== void 0) {
                  if (typeof data2.apiKeyMask !== "string") {
                    const err23 = { instancePath: instancePath + "/profiles/" + i0 + "/apiKeyMask", schemaPath: "#/definitions/BrowserProviderProfile/properties/apiKeyMask/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                }
              } else {
                const err24 = { instancePath: instancePath + "/profiles/" + i0, schemaPath: "#/definitions/BrowserProviderProfile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
          } else {
            const err25 = { instancePath: instancePath + "/profiles", schemaPath: "#/properties/profiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data.fallback !== void 0) {
          let data12 = data.fallback;
          if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
            if (data12.source === void 0) {
              const err26 = { instancePath: instancePath + "/fallback", schemaPath: "#/definitions/BrowserProviderFallback/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data12.provider === void 0) {
              const err27 = { instancePath: instancePath + "/fallback", schemaPath: "#/definitions/BrowserProviderFallback/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data12.model === void 0) {
              const err28 = { instancePath: instancePath + "/fallback", schemaPath: "#/definitions/BrowserProviderFallback/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            for (const key2 in data12) {
              if (!(key2 === "source" || key2 === "provider" || key2 === "model")) {
                const err29 = { instancePath: instancePath + "/fallback", schemaPath: "#/definitions/BrowserProviderFallback/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data12.source !== void 0) {
              let data13 = data12.source;
              if (typeof data13 !== "string") {
                const err30 = { instancePath: instancePath + "/fallback/source", schemaPath: "#/definitions/BrowserProviderFallback/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
              if ("config" !== data13) {
                const err31 = { instancePath: instancePath + "/fallback/source", schemaPath: "#/definitions/BrowserProviderFallback/properties/source/const", keyword: "const", params: { allowedValue: "config" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data12.provider !== void 0) {
              if (typeof data12.provider !== "string") {
                const err32 = { instancePath: instancePath + "/fallback/provider", schemaPath: "#/definitions/BrowserProviderFallback/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
            if (data12.model !== void 0) {
              if (typeof data12.model !== "string") {
                const err33 = { instancePath: instancePath + "/fallback/model", schemaPath: "#/definitions/BrowserProviderFallback/properties/model/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
          } else {
            const err34 = { instancePath: instancePath + "/fallback", schemaPath: "#/definitions/BrowserProviderFallback/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
      } else {
        const err35 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
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
export default require_BrowserProviderSettings_validator();
