var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// SystemContextLookupInput-validator.cjs
var require_SystemContextLookupInput_validator = __commonJS({
  "SystemContextLookupInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema15 = { "type": "string", "enum": ["conversation_history", "historical_execution", "decision_rationale"], "description": "Context Lookup \u652F\u6301\u7684\u5386\u53F2\u9700\u6C42\u7C7B\u522B\u3002" };
    function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.from === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "from" }, message: "must have required property 'from'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.to === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "to" }, message: "must have required property 'to'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "from" || key0 === "to")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.from !== void 0) {
          let data0 = data.from;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/from", schemaPath: "#/definitions/JsonInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.to !== void 0) {
          let data1 = data.to;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err4 = { instancePath: instancePath + "/to", schemaPath: "#/definitions/JsonInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
      } else {
        const err5 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      validate15.errors = vErrors;
      return errors === 0;
    }
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        for (const key0 in data) {
          if (!(key0 === "eventTypes" || key0 === "toolIds" || key0 === "actionIds" || key0 === "stepIndexes" || key0 === "paths" || key0 === "errorCodes" || key0 === "objectIds" || key0 === "sequenceRange")) {
            const err0 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
        }
        if (data.eventTypes !== void 0) {
          let data0 = data.eventTypes;
          if (Array.isArray(data0)) {
            if (data0.length > 16) {
              const err1 = { instancePath: instancePath + "/eventTypes", schemaPath: "#/properties/eventTypes/maxItems", keyword: "maxItems", params: { limit: 16 }, message: "must NOT have more than 16 items" };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
            }
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data0[i0] !== "string") {
                const err2 = { instancePath: instancePath + "/eventTypes/" + i0, schemaPath: "#/properties/eventTypes/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
          } else {
            const err3 = { instancePath: instancePath + "/eventTypes", schemaPath: "#/properties/eventTypes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.toolIds !== void 0) {
          let data2 = data.toolIds;
          if (Array.isArray(data2)) {
            if (data2.length > 16) {
              const err4 = { instancePath: instancePath + "/toolIds", schemaPath: "#/properties/toolIds/maxItems", keyword: "maxItems", params: { limit: 16 }, message: "must NOT have more than 16 items" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            const len1 = data2.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (typeof data2[i1] !== "string") {
                const err5 = { instancePath: instancePath + "/toolIds/" + i1, schemaPath: "#/properties/toolIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err5];
                } else {
                  vErrors.push(err5);
                }
                errors++;
              }
            }
          } else {
            const err6 = { instancePath: instancePath + "/toolIds", schemaPath: "#/properties/toolIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.actionIds !== void 0) {
          let data4 = data.actionIds;
          if (Array.isArray(data4)) {
            if (data4.length > 16) {
              const err7 = { instancePath: instancePath + "/actionIds", schemaPath: "#/properties/actionIds/maxItems", keyword: "maxItems", params: { limit: 16 }, message: "must NOT have more than 16 items" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            const len2 = data4.length;
            for (let i2 = 0; i2 < len2; i2++) {
              if (typeof data4[i2] !== "string") {
                const err8 = { instancePath: instancePath + "/actionIds/" + i2, schemaPath: "#/properties/actionIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
          } else {
            const err9 = { instancePath: instancePath + "/actionIds", schemaPath: "#/properties/actionIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.stepIndexes !== void 0) {
          let data6 = data.stepIndexes;
          if (Array.isArray(data6)) {
            if (data6.length > 16) {
              const err10 = { instancePath: instancePath + "/stepIndexes", schemaPath: "#/properties/stepIndexes/maxItems", keyword: "maxItems", params: { limit: 16 }, message: "must NOT have more than 16 items" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            const len3 = data6.length;
            for (let i3 = 0; i3 < len3; i3++) {
              let data7 = data6[i3];
              if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
                const err11 = { instancePath: instancePath + "/stepIndexes/" + i3, schemaPath: "#/definitions/NonNegativeInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              if (typeof data7 == "number" && isFinite(data7)) {
                if (data7 < 0 || isNaN(data7)) {
                  const err12 = { instancePath: instancePath + "/stepIndexes/" + i3, schemaPath: "#/definitions/NonNegativeInteger/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err13 = { instancePath: instancePath + "/stepIndexes", schemaPath: "#/properties/stepIndexes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.paths !== void 0) {
          let data8 = data.paths;
          if (Array.isArray(data8)) {
            if (data8.length > 16) {
              const err14 = { instancePath: instancePath + "/paths", schemaPath: "#/properties/paths/maxItems", keyword: "maxItems", params: { limit: 16 }, message: "must NOT have more than 16 items" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            const len4 = data8.length;
            for (let i4 = 0; i4 < len4; i4++) {
              if (typeof data8[i4] !== "string") {
                const err15 = { instancePath: instancePath + "/paths/" + i4, schemaPath: "#/properties/paths/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
          } else {
            const err16 = { instancePath: instancePath + "/paths", schemaPath: "#/properties/paths/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.errorCodes !== void 0) {
          let data10 = data.errorCodes;
          if (Array.isArray(data10)) {
            if (data10.length > 16) {
              const err17 = { instancePath: instancePath + "/errorCodes", schemaPath: "#/properties/errorCodes/maxItems", keyword: "maxItems", params: { limit: 16 }, message: "must NOT have more than 16 items" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            const len5 = data10.length;
            for (let i5 = 0; i5 < len5; i5++) {
              if (typeof data10[i5] !== "string") {
                const err18 = { instancePath: instancePath + "/errorCodes/" + i5, schemaPath: "#/properties/errorCodes/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/errorCodes", schemaPath: "#/properties/errorCodes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.objectIds !== void 0) {
          let data12 = data.objectIds;
          if (Array.isArray(data12)) {
            if (data12.length > 16) {
              const err20 = { instancePath: instancePath + "/objectIds", schemaPath: "#/properties/objectIds/maxItems", keyword: "maxItems", params: { limit: 16 }, message: "must NOT have more than 16 items" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            const len6 = data12.length;
            for (let i6 = 0; i6 < len6; i6++) {
              if (typeof data12[i6] !== "string") {
                const err21 = { instancePath: instancePath + "/objectIds/" + i6, schemaPath: "#/properties/objectIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/objectIds", schemaPath: "#/properties/objectIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.sequenceRange !== void 0) {
          if (!validate15(data.sequenceRange, { instancePath: instancePath + "/sequenceRange", parentData: data, parentDataProperty: "sequenceRange", rootData })) {
            vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err23 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
      validate14.errors = vErrors;
      return errors === 0;
    }
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.operation === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.need === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "need" }, message: "must have required property 'need'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.question === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "question" }, message: "must have required property 'question'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "operation" || key0 === "need" || key0 === "question" || key0 === "filters")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.operation !== void 0) {
          let data0 = data.operation;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if ("history_search" !== data0) {
            const err5 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/const", keyword: "const", params: { allowedValue: "history_search" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.need !== void 0) {
          let data1 = data.need;
          if (typeof data1 !== "string") {
            const err6 = { instancePath: instancePath + "/need", schemaPath: "#/definitions/ContextLookupNeed/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (!(data1 === "conversation_history" || data1 === "historical_execution" || data1 === "decision_rationale")) {
            const err7 = { instancePath: instancePath + "/need", schemaPath: "#/definitions/ContextLookupNeed/enum", keyword: "enum", params: { allowedValues: schema15.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.question !== void 0) {
          if (typeof data.question !== "string") {
            const err8 = { instancePath: instancePath + "/question", schemaPath: "#/properties/question/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.filters !== void 0) {
          if (!validate14(data.filters, { instancePath: instancePath + "/filters", parentData: data, parentDataProperty: "filters", rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate19(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.operation === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "operation" || key0 === "cursor" || key0 === "limit" || key0 === "category")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.operation !== void 0) {
          let data0 = data.operation;
          if (typeof data0 !== "string") {
            const err2 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
          if ("directory_browse" !== data0) {
            const err3 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/const", keyword: "const", params: { allowedValue: "directory_browse" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.cursor !== void 0) {
          if (typeof data.cursor !== "string") {
            const err4 = { instancePath: instancePath + "/cursor", schemaPath: "#/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.limit !== void 0) {
          let data2 = data.limit;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err5 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/ContextLookupPageSize/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 50 || isNaN(data2)) {
              const err6 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/ContextLookupPageSize/maximum", keyword: "maximum", params: { comparison: "<=", limit: 50 }, message: "must be <= 50" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data2 < 1 || isNaN(data2)) {
              const err7 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/ContextLookupPageSize/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
        if (data.category !== void 0) {
          if (typeof data.category !== "string") {
            const err8 = { instancePath: instancePath + "/category", schemaPath: "#/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      validate19.errors = vErrors;
      return errors === 0;
    }
    function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.operation === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.query === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "query" }, message: "must have required property 'query'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "operation" || key0 === "query" || key0 === "cursor" || key0 === "limit" || key0 === "category")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.operation !== void 0) {
          let data0 = data.operation;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("directory_search" !== data0) {
            const err4 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/const", keyword: "const", params: { allowedValue: "directory_search" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.query !== void 0) {
          if (typeof data.query !== "string") {
            const err5 = { instancePath: instancePath + "/query", schemaPath: "#/properties/query/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.cursor !== void 0) {
          if (typeof data.cursor !== "string") {
            const err6 = { instancePath: instancePath + "/cursor", schemaPath: "#/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.limit !== void 0) {
          let data3 = data.limit;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err7 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/ContextLookupPageSize/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 50 || isNaN(data3)) {
              const err8 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/ContextLookupPageSize/maximum", keyword: "maximum", params: { comparison: "<=", limit: 50 }, message: "must be <= 50" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data3 < 1 || isNaN(data3)) {
              const err9 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/ContextLookupPageSize/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
        }
        if (data.category !== void 0) {
          if (typeof data.category !== "string") {
            const err10 = { instancePath: instancePath + "/category", schemaPath: "#/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
      } else {
        const err11 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      validate21.errors = vErrors;
      return errors === 0;
    }
    function validate23(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.operation === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.sourceRef === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sourceRef" }, message: "must have required property 'sourceRef'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "operation" || key0 === "sourceRef" || key0 === "offset" || key0 === "limit")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.operation !== void 0) {
          let data0 = data.operation;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("source_expand" !== data0) {
            const err4 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/const", keyword: "const", params: { allowedValue: "source_expand" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.sourceRef !== void 0) {
          if (typeof data.sourceRef !== "string") {
            const err5 = { instancePath: instancePath + "/sourceRef", schemaPath: "#/properties/sourceRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.offset !== void 0) {
          let data2 = data.offset;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err6 = { instancePath: instancePath + "/offset", schemaPath: "#/definitions/NonNegativeInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 < 0 || isNaN(data2)) {
              const err7 = { instancePath: instancePath + "/offset", schemaPath: "#/definitions/NonNegativeInteger/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
        if (data.limit !== void 0) {
          let data3 = data.limit;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err8 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/PositiveInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 < 1 || isNaN(data3)) {
              const err9 = { instancePath: instancePath + "/limit", schemaPath: "#/definitions/PositiveInteger/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
        }
      } else {
        const err10 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      validate23.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (!validate13(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs2 = errors;
        if (!validate19(data, { instancePath, parentData, parentDataProperty, rootData })) {
          vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
          errors = vErrors.length;
        }
        var _valid0 = _errs2 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs3 = errors;
          if (!validate21(data, { instancePath, parentData, parentDataProperty, rootData })) {
            vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs4 = errors;
            if (!validate23(data, { instancePath, parentData, parentDataProperty, rootData })) {
              vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
              errors = vErrors.length;
            }
            var _valid0 = _errs4 === errors;
            valid0 = valid0 || _valid0;
          }
        }
      }
      if (!valid0) {
        const err0 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
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
        if (data.request === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "request" }, message: "must have required property 'request'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "request")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.request !== void 0) {
          if (!validate12(data.request, { instancePath: instancePath + "/request", parentData: data, parentDataProperty: "request", rootData })) {
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
export default require_SystemContextLookupInput_validator();
