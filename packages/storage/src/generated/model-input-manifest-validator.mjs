var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ModelInputManifest-validator.cjs
var require_ModelInputManifest_validator = __commonJS({
  "ModelInputManifest-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "schemaVersion": { "type": "number", "const": 1 }, "goalId": { "type": "string" }, "runId": { "type": "string" }, "callId": { "type": "string" }, "executionUnitId": { "type": "string" }, "stepIndex": { "type": "number" }, "stage": { "type": "string", "enum": ["think", "decide", "completion_review"] }, "occurredAt": { "type": "string" }, "messages": { "type": "array", "items": { "$ref": "#/definitions/ModelInputManifestMessage" } } }, "required": ["schemaVersion", "goalId", "runId", "callId", "stepIndex", "stage", "occurredAt", "messages"], "additionalProperties": false, "description": "\u6A21\u578B\u8F93\u5165 JSONL \u6E05\u5355\u7684\u6301\u4E45\u5316 DTO\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var schema13 = { "type": "object", "properties": { "role": { "type": "string", "enum": ["system", "user", "assistant", "tool"] }, "source": { "type": "string", "enum": ["system", "conversation", "section", "working_context", "stage", "request", "native_history"] }, "ref": { "type": "string" }, "callId": { "type": "string" }, "toolId": { "type": "string" }, "reasoning": { "type": "string" }, "toolCalls": { "type": "array", "items": { "$ref": "#/definitions/ModelInputJsonValue" } }, "continuation": { "$ref": "#/definitions/ModelInputJsonValue" } }, "required": ["role", "source", "ref"], "additionalProperties": false, "description": "\u6A21\u578B\u8F93\u5165\u6E05\u5355\u4E2D\u7684\u4E00\u6761\u6D88\u606F\u5F15\u7528\uFF1B\u6B63\u6587\u7531 `ref` \u6307\u5411 SHA-256 \u6587\u4EF6\u3002" };
    var wrapper0 = { validate: validate13 };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (typeof data !== "string") {
        const err0 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs3 = errors;
        if (!(typeof data == "number" && isFinite(data))) {
          const err1 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        var _valid0 = _errs3 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs5 = errors;
          if (typeof data !== "boolean") {
            const err2 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
          var _valid0 = _errs5 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs7 = errors;
            if (data !== null) {
              const err3 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "null" }, message: "must be null" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var _valid0 = _errs7 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs9 = errors;
              if (Array.isArray(data)) {
                const len0 = data.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (!wrapper0.validate(data[i0], { instancePath: instancePath + "/" + i0, parentData: data, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                    errors = vErrors.length;
                  }
                }
              } else {
                const err4 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              var _valid0 = _errs9 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs12 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  for (const key0 in data) {
                    if (!wrapper0.validate(data[key0], { instancePath: instancePath + "/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key0, rootData })) {
                      vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                      errors = vErrors.length;
                    }
                  }
                } else {
                  const err5 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                var _valid0 = _errs12 === errors;
                valid0 = valid0 || _valid0;
              }
            }
          }
        }
      }
      if (!valid0) {
        const err6 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
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
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.role === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.ref === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "ref" }, message: "must have required property 'ref'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "role" || key0 === "source" || key0 === "ref" || key0 === "callId" || key0 === "toolId" || key0 === "reasoning" || key0 === "toolCalls" || key0 === "continuation")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.role !== void 0) {
          let data0 = data.role;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data0 === "system" || data0 === "user" || data0 === "assistant" || data0 === "tool")) {
            const err5 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema13.properties.role.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.source !== void 0) {
          let data1 = data.source;
          if (typeof data1 !== "string") {
            const err6 = { instancePath: instancePath + "/source", schemaPath: "#/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (!(data1 === "system" || data1 === "conversation" || data1 === "section" || data1 === "working_context" || data1 === "stage" || data1 === "request" || data1 === "native_history")) {
            const err7 = { instancePath: instancePath + "/source", schemaPath: "#/properties/source/enum", keyword: "enum", params: { allowedValues: schema13.properties.source.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.ref !== void 0) {
          if (typeof data.ref !== "string") {
            const err8 = { instancePath: instancePath + "/ref", schemaPath: "#/properties/ref/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.callId !== void 0) {
          if (typeof data.callId !== "string") {
            const err9 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          if (typeof data.toolId !== "string") {
            const err10 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.reasoning !== void 0) {
          if (typeof data.reasoning !== "string") {
            const err11 = { instancePath: instancePath + "/reasoning", schemaPath: "#/properties/reasoning/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.toolCalls !== void 0) {
          let data6 = data.toolCalls;
          if (Array.isArray(data6)) {
            const len0 = data6.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate13(data6[i0], { instancePath: instancePath + "/toolCalls/" + i0, parentData: data6, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err12 = { instancePath: instancePath + "/toolCalls", schemaPath: "#/properties/toolCalls/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.continuation !== void 0) {
          if (!validate13(data.continuation, { instancePath: instancePath + "/continuation", parentData: data, parentDataProperty: "continuation", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
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
        if (data.schemaVersion === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schemaVersion" }, message: "must have required property 'schemaVersion'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.callId === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "callId" }, message: "must have required property 'callId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.stepIndex === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepIndex" }, message: "must have required property 'stepIndex'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.stage === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stage" }, message: "must have required property 'stage'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.occurredAt === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.messages === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messages" }, message: "must have required property 'messages'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.schemaVersion !== void 0) {
          let data0 = data.schemaVersion;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err9 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (1 !== data0) {
            const err10 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err11 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          if (typeof data.runId !== "string") {
            const err12 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.callId !== void 0) {
          if (typeof data.callId !== "string") {
            const err13 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          if (typeof data.executionUnitId !== "string") {
            const err14 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.stepIndex !== void 0) {
          let data5 = data.stepIndex;
          if (!(typeof data5 == "number" && isFinite(data5))) {
            const err15 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.stage !== void 0) {
          let data6 = data.stage;
          if (typeof data6 !== "string") {
            const err16 = { instancePath: instancePath + "/stage", schemaPath: "#/properties/stage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data6 === "think" || data6 === "decide" || data6 === "completion_review")) {
            const err17 = { instancePath: instancePath + "/stage", schemaPath: "#/properties/stage/enum", keyword: "enum", params: { allowedValues: schema12.properties.stage.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.occurredAt !== void 0) {
          if (typeof data.occurredAt !== "string") {
            const err18 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.messages !== void 0) {
          let data8 = data.messages;
          if (Array.isArray(data8)) {
            const len0 = data8.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data8[i0], { instancePath: instancePath + "/messages/" + i0, parentData: data8, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
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
export default require_ModelInputManifest_validator();
