var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GoalContextIndexSnapshotFile-validator.cjs
var require_GoalContextIndexSnapshotFile_validator = __commonJS({
  "GoalContextIndexSnapshotFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "goalId": { "type": "string" }, "runId": { "type": "string" }, "stageId": { "type": "string" }, "revision": { "type": "number" }, "target": { "type": "string" }, "status": { "type": "string", "enum": ["executing", "accepted", "rejected"] }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }, "summary": { "type": "string" }, "rejectionFeedback": { "type": "string" }, "source": { "type": "object", "properties": { "firstSequence": { "type": "number" }, "lastSequence": { "type": "number" }, "eventIds": { "type": "array", "items": { "type": "string" } } }, "required": ["firstSequence", "lastSequence", "eventIds"], "additionalProperties": false }, "reason": { "type": "string" } }, "required": ["goalId", "runId", "stageId", "revision", "target", "status", "acceptanceCriteria", "source"], "additionalProperties": false, "description": "Goal Context Index \u4E2D\u9636\u6BB5\u76EE\u5F55\u6761\u76EE\u7684\u6587\u4EF6\u8868\u793A\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var schema14 = { "type": "object", "properties": { "goalId": { "type": "string" }, "runId": { "type": "string" }, "noteId": { "type": "string" }, "revision": { "type": "number" }, "category": { "type": "string", "enum": ["decision", "user_emphasis"] }, "content": { "type": "string" }, "reason": { "type": "string" }, "stageId": { "type": "string" }, "source": { "$ref": "#/definitions/GoalNoteSourceFile" }, "supersedesNoteId": { "type": "string" } }, "required": ["goalId", "runId", "noteId", "revision", "category", "content", "source"], "additionalProperties": false, "description": "Goal Context Index \u4E2D\u91CD\u8981\u4FE1\u606F\u6761\u76EE\u7684\u6587\u4EF6\u8868\u793A\u3002" };
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.noteId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "noteId" }, message: "must have required property 'noteId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.revision === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.category === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema14.properties, key0)) {
            const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          if (typeof data.runId !== "string") {
            const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.noteId !== void 0) {
          if (typeof data.noteId !== "string") {
            const err10 = { instancePath: instancePath + "/noteId", schemaPath: "#/properties/noteId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data3 = data.revision;
          if (!(typeof data3 == "number" && isFinite(data3))) {
            const err11 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.category !== void 0) {
          let data4 = data.category;
          if (typeof data4 !== "string") {
            const err12 = { instancePath: instancePath + "/category", schemaPath: "#/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (!(data4 === "decision" || data4 === "user_emphasis")) {
            const err13 = { instancePath: instancePath + "/category", schemaPath: "#/properties/category/enum", keyword: "enum", params: { allowedValues: schema14.properties.category.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          if (typeof data.content !== "string") {
            const err14 = { instancePath: instancePath + "/content", schemaPath: "#/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.reason !== void 0) {
          if (typeof data.reason !== "string") {
            const err15 = { instancePath: instancePath + "/reason", schemaPath: "#/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.stageId !== void 0) {
          if (typeof data.stageId !== "string") {
            const err16 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.source !== void 0) {
          let data8 = data.source;
          const _errs20 = errors;
          let valid2 = false;
          const _errs21 = errors;
          if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
            if (data8.kind === void 0) {
              const err17 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data8.messageId === void 0) {
              const err18 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data8.verbatimSnippet === void 0) {
              const err19 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/required", keyword: "required", params: { missingProperty: "verbatimSnippet" }, message: "must have required property 'verbatimSnippet'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            for (const key1 in data8) {
              if (!(key1 === "kind" || key1 === "messageId" || key1 === "verbatimSnippet" || key1 === "summary")) {
                const err20 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data8.kind !== void 0) {
              let data9 = data8.kind;
              if (typeof data9 !== "string") {
                const err21 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
              if ("user_message" !== data9) {
                const err22 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "user_message" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data8.messageId !== void 0) {
              if (typeof data8.messageId !== "string") {
                const err23 = { instancePath: instancePath + "/source/messageId", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data8.verbatimSnippet !== void 0) {
              if (typeof data8.verbatimSnippet !== "string") {
                const err24 = { instancePath: instancePath + "/source/verbatimSnippet", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/properties/verbatimSnippet/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
            if (data8.summary !== void 0) {
              if (typeof data8.summary !== "string") {
                const err25 = { instancePath: instancePath + "/source/summary", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            }
          } else {
            const err26 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
          var _valid0 = _errs21 === errors;
          valid2 = valid2 || _valid0;
          if (!valid2) {
            const _errs32 = errors;
            if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
              if (data8.kind === void 0) {
                const err27 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              for (const key2 in data8) {
                if (!(key2 === "kind" || key2 === "messageId" || key2 === "summary")) {
                  const err28 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
              }
              if (data8.kind !== void 0) {
                let data13 = data8.kind;
                if (typeof data13 !== "string") {
                  const err29 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
                if ("user_decision" !== data13) {
                  const err30 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "user_decision" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              }
              if (data8.messageId !== void 0) {
                if (typeof data8.messageId !== "string") {
                  const err31 = { instancePath: instancePath + "/source/messageId", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/1/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
              }
              if (data8.summary !== void 0) {
                if (typeof data8.summary !== "string") {
                  const err32 = { instancePath: instancePath + "/source/summary", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/1/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
              }
            } else {
              const err33 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            var _valid0 = _errs32 === errors;
            valid2 = valid2 || _valid0;
            if (!valid2) {
              const _errs41 = errors;
              if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                if (data8.kind === void 0) {
                  const err34 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
                for (const key3 in data8) {
                  if (!(key3 === "kind" || key3 === "actionId" || key3 === "summary")) {
                    const err35 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                }
                if (data8.kind !== void 0) {
                  let data16 = data8.kind;
                  if (typeof data16 !== "string") {
                    const err36 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                  if ("agent_decision" !== data16) {
                    const err37 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "agent_decision" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
                if (data8.actionId !== void 0) {
                  if (typeof data8.actionId !== "string") {
                    const err38 = { instancePath: instancePath + "/source/actionId", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/2/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err38];
                    } else {
                      vErrors.push(err38);
                    }
                    errors++;
                  }
                }
                if (data8.summary !== void 0) {
                  if (typeof data8.summary !== "string") {
                    const err39 = { instancePath: instancePath + "/source/summary", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/2/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                }
              } else {
                const err40 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
              var _valid0 = _errs41 === errors;
              valid2 = valid2 || _valid0;
            }
          }
          if (!valid2) {
            const err41 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalNoteSourceFile/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err41];
            } else {
              vErrors.push(err41);
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
        if (data.supersedesNoteId !== void 0) {
          if (typeof data.supersedesNoteId !== "string") {
            const err42 = { instancePath: instancePath + "/supersedesNoteId", schemaPath: "#/properties/supersedesNoteId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
      } else {
        const err43 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err43];
        } else {
          vErrors.push(err43);
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
        if (data.buildId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "buildId" }, message: "must have required property 'buildId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.sourceBoundaries === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sourceBoundaries" }, message: "must have required property 'sourceBoundaries'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.sourceDigest === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sourceDigest" }, message: "must have required property 'sourceDigest'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.stages === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.notes === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "notes" }, message: "must have required property 'notes'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.createdAt === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "createdAt" }, message: "must have required property 'createdAt'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "schemaVersion" || key0 === "goalId" || key0 === "buildId" || key0 === "sourceBoundaries" || key0 === "sourceDigest" || key0 === "stages" || key0 === "notes" || key0 === "createdAt")) {
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
        if (data.buildId !== void 0) {
          if (typeof data.buildId !== "string") {
            const err12 = { instancePath: instancePath + "/buildId", schemaPath: "#/properties/buildId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.sourceBoundaries !== void 0) {
          let data3 = data.sourceBoundaries;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data4 = data3[i0];
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                if (data4.runId === void 0) {
                  const err13 = { instancePath: instancePath + "/sourceBoundaries/" + i0, schemaPath: "#/properties/sourceBoundaries/items/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (data4.committedThroughSequence === void 0) {
                  const err14 = { instancePath: instancePath + "/sourceBoundaries/" + i0, schemaPath: "#/properties/sourceBoundaries/items/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                for (const key1 in data4) {
                  if (!(key1 === "runId" || key1 === "committedThroughSequence")) {
                    const err15 = { instancePath: instancePath + "/sourceBoundaries/" + i0, schemaPath: "#/properties/sourceBoundaries/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data4.runId !== void 0) {
                  if (typeof data4.runId !== "string") {
                    const err16 = { instancePath: instancePath + "/sourceBoundaries/" + i0 + "/runId", schemaPath: "#/properties/sourceBoundaries/items/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
                if (data4.committedThroughSequence !== void 0) {
                  let data6 = data4.committedThroughSequence;
                  if (!(typeof data6 == "number" && isFinite(data6))) {
                    const err17 = { instancePath: instancePath + "/sourceBoundaries/" + i0 + "/committedThroughSequence", schemaPath: "#/properties/sourceBoundaries/items/properties/committedThroughSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
              } else {
                const err18 = { instancePath: instancePath + "/sourceBoundaries/" + i0, schemaPath: "#/properties/sourceBoundaries/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/sourceBoundaries", schemaPath: "#/properties/sourceBoundaries/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.sourceDigest !== void 0) {
          if (typeof data.sourceDigest !== "string") {
            const err20 = { instancePath: instancePath + "/sourceDigest", schemaPath: "#/properties/sourceDigest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.stages !== void 0) {
          let data8 = data.stages;
          if (Array.isArray(data8)) {
            const len1 = data8.length;
            for (let i1 = 0; i1 < len1; i1++) {
              let data9 = data8[i1];
              if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                if (data9.goalId === void 0) {
                  const err21 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if (data9.runId === void 0) {
                  const err22 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
                if (data9.stageId === void 0) {
                  const err23 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
                if (data9.revision === void 0) {
                  const err24 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if (data9.target === void 0) {
                  const err25 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
                if (data9.status === void 0) {
                  const err26 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
                if (data9.acceptanceCriteria === void 0) {
                  const err27 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                if (data9.source === void 0) {
                  const err28 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                for (const key2 in data9) {
                  if (!func2.call(schema13.properties, key2)) {
                    const err29 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  }
                }
                if (data9.goalId !== void 0) {
                  if (typeof data9.goalId !== "string") {
                    const err30 = { instancePath: instancePath + "/stages/" + i1 + "/goalId", schemaPath: "#/definitions/GoalStageEntryFile/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                }
                if (data9.runId !== void 0) {
                  if (typeof data9.runId !== "string") {
                    const err31 = { instancePath: instancePath + "/stages/" + i1 + "/runId", schemaPath: "#/definitions/GoalStageEntryFile/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                }
                if (data9.stageId !== void 0) {
                  if (typeof data9.stageId !== "string") {
                    const err32 = { instancePath: instancePath + "/stages/" + i1 + "/stageId", schemaPath: "#/definitions/GoalStageEntryFile/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  }
                }
                if (data9.revision !== void 0) {
                  let data13 = data9.revision;
                  if (!(typeof data13 == "number" && isFinite(data13))) {
                    const err33 = { instancePath: instancePath + "/stages/" + i1 + "/revision", schemaPath: "#/definitions/GoalStageEntryFile/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err33];
                    } else {
                      vErrors.push(err33);
                    }
                    errors++;
                  }
                }
                if (data9.target !== void 0) {
                  if (typeof data9.target !== "string") {
                    const err34 = { instancePath: instancePath + "/stages/" + i1 + "/target", schemaPath: "#/definitions/GoalStageEntryFile/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
                if (data9.status !== void 0) {
                  let data15 = data9.status;
                  if (typeof data15 !== "string") {
                    const err35 = { instancePath: instancePath + "/stages/" + i1 + "/status", schemaPath: "#/definitions/GoalStageEntryFile/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                  if (!(data15 === "executing" || data15 === "accepted" || data15 === "rejected")) {
                    const err36 = { instancePath: instancePath + "/stages/" + i1 + "/status", schemaPath: "#/definitions/GoalStageEntryFile/properties/status/enum", keyword: "enum", params: { allowedValues: schema13.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                }
                if (data9.acceptanceCriteria !== void 0) {
                  let data16 = data9.acceptanceCriteria;
                  if (Array.isArray(data16)) {
                    const len2 = data16.length;
                    for (let i2 = 0; i2 < len2; i2++) {
                      if (typeof data16[i2] !== "string") {
                        const err37 = { instancePath: instancePath + "/stages/" + i1 + "/acceptanceCriteria/" + i2, schemaPath: "#/definitions/GoalStageEntryFile/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err37];
                        } else {
                          vErrors.push(err37);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err38 = { instancePath: instancePath + "/stages/" + i1 + "/acceptanceCriteria", schemaPath: "#/definitions/GoalStageEntryFile/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err38];
                    } else {
                      vErrors.push(err38);
                    }
                    errors++;
                  }
                }
                if (data9.summary !== void 0) {
                  if (typeof data9.summary !== "string") {
                    const err39 = { instancePath: instancePath + "/stages/" + i1 + "/summary", schemaPath: "#/definitions/GoalStageEntryFile/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                }
                if (data9.rejectionFeedback !== void 0) {
                  if (typeof data9.rejectionFeedback !== "string") {
                    const err40 = { instancePath: instancePath + "/stages/" + i1 + "/rejectionFeedback", schemaPath: "#/definitions/GoalStageEntryFile/properties/rejectionFeedback/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                }
                if (data9.source !== void 0) {
                  let data20 = data9.source;
                  if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
                    if (data20.firstSequence === void 0) {
                      const err41 = { instancePath: instancePath + "/stages/" + i1 + "/source", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/required", keyword: "required", params: { missingProperty: "firstSequence" }, message: "must have required property 'firstSequence'" };
                      if (vErrors === null) {
                        vErrors = [err41];
                      } else {
                        vErrors.push(err41);
                      }
                      errors++;
                    }
                    if (data20.lastSequence === void 0) {
                      const err42 = { instancePath: instancePath + "/stages/" + i1 + "/source", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/required", keyword: "required", params: { missingProperty: "lastSequence" }, message: "must have required property 'lastSequence'" };
                      if (vErrors === null) {
                        vErrors = [err42];
                      } else {
                        vErrors.push(err42);
                      }
                      errors++;
                    }
                    if (data20.eventIds === void 0) {
                      const err43 = { instancePath: instancePath + "/stages/" + i1 + "/source", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/required", keyword: "required", params: { missingProperty: "eventIds" }, message: "must have required property 'eventIds'" };
                      if (vErrors === null) {
                        vErrors = [err43];
                      } else {
                        vErrors.push(err43);
                      }
                      errors++;
                    }
                    for (const key3 in data20) {
                      if (!(key3 === "firstSequence" || key3 === "lastSequence" || key3 === "eventIds")) {
                        const err44 = { instancePath: instancePath + "/stages/" + i1 + "/source", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err44];
                        } else {
                          vErrors.push(err44);
                        }
                        errors++;
                      }
                    }
                    if (data20.firstSequence !== void 0) {
                      let data21 = data20.firstSequence;
                      if (!(typeof data21 == "number" && isFinite(data21))) {
                        const err45 = { instancePath: instancePath + "/stages/" + i1 + "/source/firstSequence", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/properties/firstSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err45];
                        } else {
                          vErrors.push(err45);
                        }
                        errors++;
                      }
                    }
                    if (data20.lastSequence !== void 0) {
                      let data22 = data20.lastSequence;
                      if (!(typeof data22 == "number" && isFinite(data22))) {
                        const err46 = { instancePath: instancePath + "/stages/" + i1 + "/source/lastSequence", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/properties/lastSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err46];
                        } else {
                          vErrors.push(err46);
                        }
                        errors++;
                      }
                    }
                    if (data20.eventIds !== void 0) {
                      let data23 = data20.eventIds;
                      if (Array.isArray(data23)) {
                        const len3 = data23.length;
                        for (let i3 = 0; i3 < len3; i3++) {
                          if (typeof data23[i3] !== "string") {
                            const err47 = { instancePath: instancePath + "/stages/" + i1 + "/source/eventIds/" + i3, schemaPath: "#/definitions/GoalStageEntryFile/properties/source/properties/eventIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err47];
                            } else {
                              vErrors.push(err47);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err48 = { instancePath: instancePath + "/stages/" + i1 + "/source/eventIds", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/properties/eventIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err48];
                        } else {
                          vErrors.push(err48);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err49 = { instancePath: instancePath + "/stages/" + i1 + "/source", schemaPath: "#/definitions/GoalStageEntryFile/properties/source/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err49];
                    } else {
                      vErrors.push(err49);
                    }
                    errors++;
                  }
                }
                if (data9.reason !== void 0) {
                  if (typeof data9.reason !== "string") {
                    const err50 = { instancePath: instancePath + "/stages/" + i1 + "/reason", schemaPath: "#/definitions/GoalStageEntryFile/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err50];
                    } else {
                      vErrors.push(err50);
                    }
                    errors++;
                  }
                }
              } else {
                const err51 = { instancePath: instancePath + "/stages/" + i1, schemaPath: "#/definitions/GoalStageEntryFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
          } else {
            const err52 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
        }
        if (data.notes !== void 0) {
          let data26 = data.notes;
          if (Array.isArray(data26)) {
            const len4 = data26.length;
            for (let i4 = 0; i4 < len4; i4++) {
              if (!validate12(data26[i4], { instancePath: instancePath + "/notes/" + i4, parentData: data26, parentDataProperty: i4, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err53 = { instancePath: instancePath + "/notes", schemaPath: "#/properties/notes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
        }
        if (data.createdAt !== void 0) {
          let data28 = data.createdAt;
          if (!(typeof data28 == "number" && isFinite(data28))) {
            const err54 = { instancePath: instancePath + "/createdAt", schemaPath: "#/properties/createdAt/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err54];
            } else {
              vErrors.push(err54);
            }
            errors++;
          }
        }
      } else {
        const err55 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err55];
        } else {
          vErrors.push(err55);
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
export default require_GoalContextIndexSnapshotFile_validator();
