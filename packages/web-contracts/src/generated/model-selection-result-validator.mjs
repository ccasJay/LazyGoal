var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserModelSelectionResult-validator.cjs
var require_BrowserModelSelectionResult_validator = __commonJS({
  "BrowserModelSelectionResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "selection": { "$ref": "#/definitions/BrowserModelSelectionCommit" }, "defaultPreference": { "$ref": "#/definitions/BrowserModelPreferenceOutcome", "description": "\u53EA\u5728\u8BF7\u6C42\u4FDD\u5B58\u9ED8\u8BA4\u504F\u597D\u65F6\u62A5\u544A\uFF1B\u6A21\u578B\u5207\u6362\u5DF2\u6210\u529F\u65F6\u4ECD\u53EF\u5355\u72EC\u5931\u8D25\u3002" } }, "required": ["ok", "goalId", "runId", "selection"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "goal_busy", "model_switch_not_allowed", "model_not_selectable", "model_catalog_unavailable", "model_selection_failed", "service_shutting_down"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u6A21\u578B\u9009\u62E9\u7ED3\u679C\u3002" };
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
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.selection === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "selection" }, message: "must have required property 'selection'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "selection" || key0 === "defaultPreference")) {
            const err4 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (true !== data0) {
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.selection !== void 0) {
          let data3 = data.selection;
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.modelId === void 0) {
              const err11 = { instancePath: instancePath + "/selection", schemaPath: "#/definitions/BrowserModelSelectionCommit/required", keyword: "required", params: { missingProperty: "modelId" }, message: "must have required property 'modelId'" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "modelId" || key1 === "providerProfileId")) {
                const err12 = { instancePath: instancePath + "/selection", schemaPath: "#/definitions/BrowserModelSelectionCommit/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data3.modelId !== void 0) {
              let data4 = data3.modelId;
              if (typeof data4 === "string") {
                if (!pattern0.test(data4)) {
                  const err13 = { instancePath: instancePath + "/selection/modelId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/modelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              } else {
                const err14 = { instancePath: instancePath + "/selection/modelId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data3.providerProfileId !== void 0) {
              let data5 = data3.providerProfileId;
              if (typeof data5 === "string") {
                if (!pattern0.test(data5)) {
                  const err15 = { instancePath: instancePath + "/selection/providerProfileId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/providerProfileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
              } else {
                const err16 = { instancePath: instancePath + "/selection/providerProfileId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/providerProfileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
          } else {
            const err17 = { instancePath: instancePath + "/selection", schemaPath: "#/definitions/BrowserModelSelectionCommit/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.defaultPreference !== void 0) {
          let data6 = data.defaultPreference;
          const _errs20 = errors;
          let valid5 = false;
          const _errs21 = errors;
          if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
            if (data6.ok === void 0) {
              const err18 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            for (const key2 in data6) {
              if (!(key2 === "ok")) {
                const err19 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data6.ok !== void 0) {
              let data7 = data6.ok;
              if (typeof data7 !== "boolean") {
                const err20 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              if (true !== data7) {
                const err21 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          var _valid1 = _errs21 === errors;
          valid5 = valid5 || _valid1;
          if (!valid5) {
            const _errs26 = errors;
            if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
              if (data6.ok === void 0) {
                const err23 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              if (data6.error === void 0) {
                const err24 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              for (const key3 in data6) {
                if (!(key3 === "ok" || key3 === "error")) {
                  const err25 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
              if (data6.ok !== void 0) {
                let data8 = data6.ok;
                if (typeof data8 !== "boolean") {
                  const err26 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
                if (false !== data8) {
                  const err27 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              }
              if (data6.error !== void 0) {
                let data9 = data6.error;
                if (typeof data9 !== "string") {
                  const err28 = { instancePath: instancePath + "/defaultPreference/error", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                if ("model_preference_save_failed" !== data9) {
                  const err29 = { instancePath: instancePath + "/defaultPreference/error", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/error/const", keyword: "const", params: { allowedValue: "model_preference_save_failed" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              }
            } else {
              const err30 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            var _valid1 = _errs26 === errors;
            valid5 = valid5 || _valid1;
          }
          if (!valid5) {
            const err31 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          } else {
            errors = _errs20;
            if (vErrors !== null) {
              if (_errs20) {
                vErrors.length = _errs20;
              } else {
                vErrors = null;
              }
            }
          }
        }
      } else {
        const err32 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs33 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err33 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err34 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
          for (const key4 in data) {
            if (!(key4 === "ok" || key4 === "error")) {
              const err35 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data10 = data.ok;
            if (typeof data10 !== "boolean") {
              const err36 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (false !== data10) {
              const err37 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data11 = data.error;
            if (typeof data11 !== "string") {
              const err38 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (!(data11 === "goal_not_found" || data11 === "stale_run" || data11 === "goal_busy" || data11 === "model_switch_not_allowed" || data11 === "model_not_selectable" || data11 === "model_catalog_unavailable" || data11 === "model_selection_failed" || data11 === "service_shutting_down")) {
              const err39 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
        } else {
          const err40 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        var _valid0 = _errs33 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err41 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
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
export default require_BrowserModelSelectionResult_validator();
