var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// TriggerDeliveryOutcome-validator.cjs
var require_TriggerDeliveryOutcome_validator = __commonJS({
  "TriggerDeliveryOutcome-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      const _errs1 = errors;
      let valid1 = false;
      const _errs2 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "goalId")) {
            const err2 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("accepted" !== data0) {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "accepted" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err5 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      var _valid0 = _errs2 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs9 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err7 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (data.reason === void 0) {
            const err8 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (data.goalId === void 0) {
            const err9 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "reason" || key1 === "goalId")) {
              const err10 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
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
            if (typeof data2 !== "string") {
              const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if ("rejected" !== data2) {
              const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "rejected" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data.reason !== void 0) {
            let data3 = data.reason;
            if (typeof data3 !== "string") {
              const err13 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if ("goal-id-occupied" !== data3) {
              const err14 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/properties/reason/const", keyword: "const", params: { allowedValue: "goal-id-occupied" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data.goalId !== void 0) {
            if (typeof data.goalId !== "string") {
              const err15 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        } else {
          const err16 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        var _valid0 = _errs9 === errors;
        valid1 = valid1 || _valid0;
        if (!valid1) {
          const _errs18 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err17 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "kind")) {
                const err18 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data5 = data.kind;
              if (typeof data5 !== "string") {
                const err19 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              if ("ignored" !== data5) {
                const err20 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "ignored" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
          } else {
            const err21 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          var _valid0 = _errs18 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs23 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err22 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              for (const key3 in data) {
                if (!(key3 === "kind")) {
                  const err23 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data6 = data.kind;
                if (typeof data6 !== "string") {
                  const err24 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if ("handled" !== data6) {
                  const err25 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "handled" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
            } else {
              const err26 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            var _valid0 = _errs23 === errors;
            valid1 = valid1 || _valid0;
          }
        }
      }
      if (!valid1) {
        const err27 = { instancePath, schemaPath: "#/definitions/TriggerDeliveryOutcome/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
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
export default require_TriggerDeliveryOutcome_validator();
