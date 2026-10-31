var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserModelCatalog-validator.cjs
var require_BrowserModelCatalog_validator = __commonJS({
  "BrowserModelCatalog-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema14 = { "type": "string", "enum": ["provider_changed", "model_unavailable"], "description": "\u9ED8\u8BA4\u6A21\u578B\u63D0\u793A\u544A\u8B66\u5206\u7C7B\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema15 = { "type": "object", "properties": { "id": { "type": "string", "pattern": "\\S" }, "displayName": { "type": "string", "pattern": "\\S" }, "availabilitySource": { "$ref": "#/definitions/BrowserModelAvailabilitySource" }, "metadataSource": { "$ref": "#/definitions/BrowserModelMetadataSource" }, "selectable": { "type": "boolean" }, "contextWindowTokens": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "maxOutputTokens": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "reasoning": { "type": "boolean" }, "vision": { "type": "boolean" }, "unavailableReason": { "type": "string" } }, "required": ["id", "displayName", "availabilitySource", "metadataSource", "selectable"], "additionalProperties": false, "description": "\u5019\u9009\u6A21\u578B\u9879\u7684\u5C55\u793A\u5C5E\u6027\u3002" };
    var schema16 = { "type": "string", "enum": ["live", "catalog", "configured"], "description": "\u6A21\u578B\u53EF\u7528\u6027\u6765\u6E90\u3002" };
    var schema17 = { "type": "string", "enum": ["live", "catalog", "execution", "configured", "mixed"], "description": "\u6A21\u578B\u5143\u6570\u636E\u6765\u6E90\u5206\u7C7B\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.id === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.displayName === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "displayName" }, message: "must have required property 'displayName'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.availabilitySource === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "availabilitySource" }, message: "must have required property 'availabilitySource'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.metadataSource === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "metadataSource" }, message: "must have required property 'metadataSource'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.selectable === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "selectable" }, message: "must have required property 'selectable'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema15.properties, key0)) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          let data0 = data.id;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err6 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.displayName !== void 0) {
          let data1 = data.displayName;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err8 = { instancePath: instancePath + "/displayName", schemaPath: "#/properties/displayName/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/displayName", schemaPath: "#/properties/displayName/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.availabilitySource !== void 0) {
          let data2 = data.availabilitySource;
          if (typeof data2 !== "string") {
            const err10 = { instancePath: instancePath + "/availabilitySource", schemaPath: "#/definitions/BrowserModelAvailabilitySource/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (!(data2 === "live" || data2 === "catalog" || data2 === "configured")) {
            const err11 = { instancePath: instancePath + "/availabilitySource", schemaPath: "#/definitions/BrowserModelAvailabilitySource/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.metadataSource !== void 0) {
          let data3 = data.metadataSource;
          if (typeof data3 !== "string") {
            const err12 = { instancePath: instancePath + "/metadataSource", schemaPath: "#/definitions/BrowserModelMetadataSource/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (!(data3 === "live" || data3 === "catalog" || data3 === "execution" || data3 === "configured" || data3 === "mixed")) {
            const err13 = { instancePath: instancePath + "/metadataSource", schemaPath: "#/definitions/BrowserModelMetadataSource/enum", keyword: "enum", params: { allowedValues: schema17.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.selectable !== void 0) {
          if (typeof data.selectable !== "boolean") {
            const err14 = { instancePath: instancePath + "/selectable", schemaPath: "#/properties/selectable/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.contextWindowTokens !== void 0) {
          let data5 = data.contextWindowTokens;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
            const err15 = { instancePath: instancePath + "/contextWindowTokens", schemaPath: "#/properties/contextWindowTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 > 9007199254740991 || isNaN(data5)) {
              const err16 = { instancePath: instancePath + "/contextWindowTokens", schemaPath: "#/properties/contextWindowTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (data5 < 1 || isNaN(data5)) {
              const err17 = { instancePath: instancePath + "/contextWindowTokens", schemaPath: "#/properties/contextWindowTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
        }
        if (data.maxOutputTokens !== void 0) {
          let data6 = data.maxOutputTokens;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err18 = { instancePath: instancePath + "/maxOutputTokens", schemaPath: "#/properties/maxOutputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err19 = { instancePath: instancePath + "/maxOutputTokens", schemaPath: "#/properties/maxOutputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data6 < 1 || isNaN(data6)) {
              const err20 = { instancePath: instancePath + "/maxOutputTokens", schemaPath: "#/properties/maxOutputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
        }
        if (data.reasoning !== void 0) {
          if (typeof data.reasoning !== "boolean") {
            const err21 = { instancePath: instancePath + "/reasoning", schemaPath: "#/properties/reasoning/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.vision !== void 0) {
          if (typeof data.vision !== "boolean") {
            const err22 = { instancePath: instancePath + "/vision", schemaPath: "#/properties/vision/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.unavailableReason !== void 0) {
          if (typeof data.unavailableReason !== "string") {
            const err23 = { instancePath: instancePath + "/unavailableReason", schemaPath: "#/properties/unavailableReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.provider === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.currentModelId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "currentModelId" }, message: "must have required property 'currentModelId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.models === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "models" }, message: "must have required property 'models'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "provider" || key0 === "profileId" || key0 === "sources" || key0 === "currentModelId" || key0 === "defaultModelNotice" || key0 === "models")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.provider !== void 0) {
          let data0 = data.provider;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err4 = { instancePath: instancePath + "/provider", schemaPath: "#/properties/provider/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/provider", schemaPath: "#/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.profileId !== void 0) {
          let data1 = data.profileId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err6 = { instancePath: instancePath + "/profileId", schemaPath: "#/properties/profileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/profileId", schemaPath: "#/properties/profileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.sources !== void 0) {
          let data2 = data.sources;
          if (Array.isArray(data2)) {
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data3 = data2[i0];
              if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                if (data3.kind === void 0) {
                  const err8 = { instancePath: instancePath + "/sources/" + i0, schemaPath: "#/definitions/BrowserModelSourceRef/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                if (data3.label === void 0) {
                  const err9 = { instancePath: instancePath + "/sources/" + i0, schemaPath: "#/definitions/BrowserModelSourceRef/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                if (data3.active === void 0) {
                  const err10 = { instancePath: instancePath + "/sources/" + i0, schemaPath: "#/definitions/BrowserModelSourceRef/required", keyword: "required", params: { missingProperty: "active" }, message: "must have required property 'active'" };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
                for (const key1 in data3) {
                  if (!(key1 === "profileId" || key1 === "kind" || key1 === "label" || key1 === "active")) {
                    const err11 = { instancePath: instancePath + "/sources/" + i0, schemaPath: "#/definitions/BrowserModelSourceRef/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data3.profileId !== void 0) {
                  let data4 = data3.profileId;
                  if (typeof data4 === "string") {
                    if (!pattern0.test(data4)) {
                      const err12 = { instancePath: instancePath + "/sources/" + i0 + "/profileId", schemaPath: "#/definitions/BrowserModelSourceRef/properties/profileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err12];
                      } else {
                        vErrors.push(err12);
                      }
                      errors++;
                    }
                  } else {
                    const err13 = { instancePath: instancePath + "/sources/" + i0 + "/profileId", schemaPath: "#/definitions/BrowserModelSourceRef/properties/profileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
                if (data3.kind !== void 0) {
                  if (typeof data3.kind !== "string") {
                    const err14 = { instancePath: instancePath + "/sources/" + i0 + "/kind", schemaPath: "#/definitions/BrowserModelSourceRef/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                }
                if (data3.label !== void 0) {
                  if (typeof data3.label !== "string") {
                    const err15 = { instancePath: instancePath + "/sources/" + i0 + "/label", schemaPath: "#/definitions/BrowserModelSourceRef/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data3.active !== void 0) {
                  if (typeof data3.active !== "boolean") {
                    const err16 = { instancePath: instancePath + "/sources/" + i0 + "/active", schemaPath: "#/definitions/BrowserModelSourceRef/properties/active/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
              } else {
                const err17 = { instancePath: instancePath + "/sources/" + i0, schemaPath: "#/definitions/BrowserModelSourceRef/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/sources", schemaPath: "#/properties/sources/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.currentModelId !== void 0) {
          let data8 = data.currentModelId;
          if (typeof data8 === "string") {
            if (!pattern0.test(data8)) {
              const err19 = { instancePath: instancePath + "/currentModelId", schemaPath: "#/properties/currentModelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          } else {
            const err20 = { instancePath: instancePath + "/currentModelId", schemaPath: "#/properties/currentModelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.defaultModelNotice !== void 0) {
          let data9 = data.defaultModelNotice;
          if (typeof data9 !== "string") {
            const err21 = { instancePath: instancePath + "/defaultModelNotice", schemaPath: "#/definitions/BrowserModelCatalogNotice/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (!(data9 === "provider_changed" || data9 === "model_unavailable")) {
            const err22 = { instancePath: instancePath + "/defaultModelNotice", schemaPath: "#/definitions/BrowserModelCatalogNotice/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.models !== void 0) {
          let data10 = data.models;
          if (Array.isArray(data10)) {
            const len1 = data10.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (!validate12(data10[i1], { instancePath: instancePath + "/models/" + i1, parentData: data10, parentDataProperty: i1, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err23 = { instancePath: instancePath + "/models", schemaPath: "#/properties/models/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
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
export default require_BrowserModelCatalog_validator();
