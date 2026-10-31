var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserGoalPlan-validator.cjs
var require_BrowserGoalPlan_validator = __commonJS({
  "BrowserGoalPlan-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "id": { "type": "string", "pattern": "\\S" }, "content": { "type": "string" }, "position": { "type": "integer", "maximum": 9007199254740991 }, "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] } }, "required": ["id", "content", "position", "status"], "additionalProperties": false, "description": "\u76EE\u6807\u62C6\u89E3\u8BA1\u5212\u4E2D\u7684\u6761\u76EE\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.revision === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.items === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "items" }, message: "must have required property 'items'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "revision" || key0 === "items")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data0 = data.revision;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err4 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          }
        }
        if (data.items !== void 0) {
          let data1 = data.items;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                if (data2.id === void 0) {
                  const err5 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                if (data2.content === void 0) {
                  const err6 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                if (data2.position === void 0) {
                  const err7 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data2.status === void 0) {
                  const err8 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!(key1 === "id" || key1 === "content" || key1 === "position" || key1 === "status")) {
                    const err9 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data2.id !== void 0) {
                  let data3 = data2.id;
                  if (typeof data3 === "string") {
                    if (!pattern0.test(data3)) {
                      const err10 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err10];
                      } else {
                        vErrors.push(err10);
                      }
                      errors++;
                    }
                  } else {
                    const err11 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data2.content !== void 0) {
                  if (typeof data2.content !== "string") {
                    const err12 = { instancePath: instancePath + "/items/" + i0 + "/content", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
                if (data2.position !== void 0) {
                  let data5 = data2.position;
                  if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                    const err13 = { instancePath: instancePath + "/items/" + i0 + "/position", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/position/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                  if (typeof data5 == "number" && isFinite(data5)) {
                    if (data5 > 9007199254740991 || isNaN(data5)) {
                      const err14 = { instancePath: instancePath + "/items/" + i0 + "/position", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/position/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err14];
                      } else {
                        vErrors.push(err14);
                      }
                      errors++;
                    }
                  }
                }
                if (data2.status !== void 0) {
                  let data6 = data2.status;
                  if (typeof data6 !== "string") {
                    const err15 = { instancePath: instancePath + "/items/" + i0 + "/status", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                  if (!(data6 === "pending" || data6 === "in_progress" || data6 === "completed" || data6 === "cancelled")) {
                    const err16 = { instancePath: instancePath + "/items/" + i0 + "/status", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/status/enum", keyword: "enum", params: { allowedValues: schema13.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
              } else {
                const err17 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
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
export default require_BrowserGoalPlan_validator();
