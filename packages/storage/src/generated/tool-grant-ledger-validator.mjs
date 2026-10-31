var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ToolGrantLedgerFile-validator.cjs
var require_ToolGrantLedgerFile_validator = __commonJS({
  "ToolGrantLedgerFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "id": { "type": "string" }, "scope": { "type": "string", "enum": ["goal", "workspace"] }, "workspaceId": { "type": "string" }, "goalId": { "type": "string" }, "source": { "$ref": "#/definitions/ToolGrantFileSource" }, "matcher": { "$ref": "#/definitions/ToolGrantFileMatcher" }, "status": { "type": "string", "enum": ["pending", "active", "revoked"] } }, "required": ["id", "scope", "workspaceId", "source", "matcher", "status"], "additionalProperties": false, "description": "Tool Grant \u8D26\u672C\u4E2D\u7684\u5355\u6761\u6388\u6743\u6587\u4EF6\u8868\u793A\u3002" };
    var schema15 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "exact_input" }, "toolId": { "type": "string" }, "version": { "type": "number", "const": 1 }, "digest": { "type": "string" } }, "required": ["kind", "toolId", "version", "digest"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "target_path" }, "toolId": { "type": "string", "enum": ["write_file", "edit_file"] }, "version": { "type": "number", "const": 1 }, "path": { "type": "string" } }, "required": ["kind", "toolId", "version", "path"], "additionalProperties": false }], "description": "Tool Grant \u8D26\u672C\u4E2D\u7684\u64CD\u4F5C\u5339\u914D\u5668\u6587\u4EF6\u8868\u793A\u3002" };
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
        if (data.scope === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.workspaceId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "workspaceId" }, message: "must have required property 'workspaceId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.matcher === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "matcher" }, message: "must have required property 'matcher'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "scope" || key0 === "workspaceId" || key0 === "goalId" || key0 === "source" || key0 === "matcher" || key0 === "status")) {
            const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err7 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data1 = data.scope;
          if (typeof data1 !== "string") {
            const err8 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data1 === "goal" || data1 === "workspace")) {
            const err9 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/enum", keyword: "enum", params: { allowedValues: schema13.properties.scope.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.workspaceId !== void 0) {
          if (typeof data.workspaceId !== "string") {
            const err10 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/properties/workspaceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
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
        if (data.source !== void 0) {
          let data4 = data.source;
          if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
            if (data4.goalId === void 0) {
              const err12 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ToolGrantFileSource/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data4.runId === void 0) {
              const err13 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ToolGrantFileSource/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data4.actionId === void 0) {
              const err14 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ToolGrantFileSource/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data4.approvalInputId === void 0) {
              const err15 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ToolGrantFileSource/required", keyword: "required", params: { missingProperty: "approvalInputId" }, message: "must have required property 'approvalInputId'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key1 in data4) {
              if (!(key1 === "goalId" || key1 === "runId" || key1 === "actionId" || key1 === "approvalInputId")) {
                const err16 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ToolGrantFileSource/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data4.goalId !== void 0) {
              if (typeof data4.goalId !== "string") {
                const err17 = { instancePath: instancePath + "/source/goalId", schemaPath: "#/definitions/ToolGrantFileSource/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data4.runId !== void 0) {
              if (typeof data4.runId !== "string") {
                const err18 = { instancePath: instancePath + "/source/runId", schemaPath: "#/definitions/ToolGrantFileSource/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data4.actionId !== void 0) {
              if (typeof data4.actionId !== "string") {
                const err19 = { instancePath: instancePath + "/source/actionId", schemaPath: "#/definitions/ToolGrantFileSource/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data4.approvalInputId !== void 0) {
              if (typeof data4.approvalInputId !== "string") {
                const err20 = { instancePath: instancePath + "/source/approvalInputId", schemaPath: "#/definitions/ToolGrantFileSource/properties/approvalInputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
          } else {
            const err21 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ToolGrantFileSource/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.matcher !== void 0) {
          let data9 = data.matcher;
          const _errs24 = errors;
          let valid4 = false;
          const _errs25 = errors;
          if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
            if (data9.kind === void 0) {
              const err22 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (data9.toolId === void 0) {
              const err23 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if (data9.version === void 0) {
              const err24 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (data9.digest === void 0) {
              const err25 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/required", keyword: "required", params: { missingProperty: "digest" }, message: "must have required property 'digest'" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            for (const key2 in data9) {
              if (!(key2 === "kind" || key2 === "toolId" || key2 === "version" || key2 === "digest")) {
                const err26 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data9.kind !== void 0) {
              let data10 = data9.kind;
              if (typeof data10 !== "string") {
                const err27 = { instancePath: instancePath + "/matcher/kind", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              if ("exact_input" !== data10) {
                const err28 = { instancePath: instancePath + "/matcher/kind", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "exact_input" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data9.toolId !== void 0) {
              if (typeof data9.toolId !== "string") {
                const err29 = { instancePath: instancePath + "/matcher/toolId", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data9.version !== void 0) {
              let data12 = data9.version;
              if (!(typeof data12 == "number" && isFinite(data12))) {
                const err30 = { instancePath: instancePath + "/matcher/version", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
              if (1 !== data12) {
                const err31 = { instancePath: instancePath + "/matcher/version", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data9.digest !== void 0) {
              if (typeof data9.digest !== "string") {
                const err32 = { instancePath: instancePath + "/matcher/digest", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/properties/digest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
          } else {
            const err33 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          var _valid0 = _errs25 === errors;
          valid4 = valid4 || _valid0;
          if (!valid4) {
            const _errs36 = errors;
            if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
              if (data9.kind === void 0) {
                const err34 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
              if (data9.toolId === void 0) {
                const err35 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
              if (data9.version === void 0) {
                const err36 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
              if (data9.path === void 0) {
                const err37 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/required", keyword: "required", params: { missingProperty: "path" }, message: "must have required property 'path'" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
              for (const key3 in data9) {
                if (!(key3 === "kind" || key3 === "toolId" || key3 === "version" || key3 === "path")) {
                  const err38 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
              }
              if (data9.kind !== void 0) {
                let data14 = data9.kind;
                if (typeof data14 !== "string") {
                  const err39 = { instancePath: instancePath + "/matcher/kind", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                if ("target_path" !== data14) {
                  const err40 = { instancePath: instancePath + "/matcher/kind", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "target_path" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
              }
              if (data9.toolId !== void 0) {
                let data15 = data9.toolId;
                if (typeof data15 !== "string") {
                  const err41 = { instancePath: instancePath + "/matcher/toolId", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
                if (!(data15 === "write_file" || data15 === "edit_file")) {
                  const err42 = { instancePath: instancePath + "/matcher/toolId", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/properties/toolId/enum", keyword: "enum", params: { allowedValues: schema15.anyOf[1].properties.toolId.enum }, message: "must be equal to one of the allowed values" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
              }
              if (data9.version !== void 0) {
                let data16 = data9.version;
                if (!(typeof data16 == "number" && isFinite(data16))) {
                  const err43 = { instancePath: instancePath + "/matcher/version", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
                if (1 !== data16) {
                  const err44 = { instancePath: instancePath + "/matcher/version", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              }
              if (data9.path !== void 0) {
                if (typeof data9.path !== "string") {
                  const err45 = { instancePath: instancePath + "/matcher/path", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/properties/path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err45];
                  } else {
                    vErrors.push(err45);
                  }
                  errors++;
                }
              }
            } else {
              const err46 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
            var _valid0 = _errs36 === errors;
            valid4 = valid4 || _valid0;
          }
          if (!valid4) {
            const err47 = { instancePath: instancePath + "/matcher", schemaPath: "#/definitions/ToolGrantFileMatcher/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err47];
            } else {
              vErrors.push(err47);
            }
            errors++;
          } else {
            errors = _errs24;
            if (vErrors !== null) {
              if (_errs24) {
                vErrors.length = _errs24;
              } else {
                vErrors = null;
              }
            }
          }
        }
        if (data.status !== void 0) {
          let data18 = data.status;
          if (typeof data18 !== "string") {
            const err48 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
          if (!(data18 === "pending" || data18 === "active" || data18 === "revoked")) {
            const err49 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema13.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
      } else {
        const err50 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
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
        if (data.version === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.grants === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "grants" }, message: "must have required property 'grants'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "version" || key0 === "grants")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.version !== void 0) {
          let data0 = data.version;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (1 !== data0) {
            const err4 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.grants !== void 0) {
          let data1 = data.grants;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data1[i0], { instancePath: instancePath + "/grants/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err5 = { instancePath: instancePath + "/grants", schemaPath: "#/properties/grants/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
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
export default require_ToolGrantLedgerFile_validator();
