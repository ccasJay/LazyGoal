var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GoalSnapshotV1-validator.cjs
var require_GoalSnapshotV1_validator = __commonJS({
  "GoalSnapshotV1-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.intent === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "intent" }, message: "must have required property 'intent'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.promptBundleVersion === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "promptBundleVersion" }, message: "must have required property 'promptBundleVersion'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.memoryProtocol === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "memoryProtocol" }, message: "must have required property 'memoryProtocol'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.modelContextProtocol === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "modelContextProtocol" }, message: "must have required property 'modelContextProtocol'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.contextRetrievalProtocol === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "contextRetrievalProtocol" }, message: "must have required property 'contextRetrievalProtocol'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.profile === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "profile" }, message: "must have required property 'profile'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.executionPolicy === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "executionPolicy" }, message: "must have required property 'executionPolicy'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "intent" || key0 === "promptBundleVersion" || key0 === "memoryProtocol" || key0 === "modelContextProtocol" || key0 === "contextRetrievalProtocol" || key0 === "profile" || key0 === "executionPolicy")) {
            const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.intent !== void 0) {
          if (typeof data.intent !== "string") {
            const err8 = { instancePath: instancePath + "/intent", schemaPath: "#/properties/intent/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.promptBundleVersion !== void 0) {
          let data1 = data.promptBundleVersion;
          if (!(typeof data1 == "number" && isFinite(data1))) {
            const err9 = { instancePath: instancePath + "/promptBundleVersion", schemaPath: "#/properties/promptBundleVersion/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (1 !== data1) {
            const err10 = { instancePath: instancePath + "/promptBundleVersion", schemaPath: "#/properties/promptBundleVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.memoryProtocol !== void 0) {
          let data2 = data.memoryProtocol;
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.kind === void 0) {
              const err11 = { instancePath: instancePath + "/memoryProtocol", schemaPath: "#/properties/memoryProtocol/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (data2.version === void 0) {
              const err12 = { instancePath: instancePath + "/memoryProtocol", schemaPath: "#/properties/memoryProtocol/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            for (const key1 in data2) {
              if (!(key1 === "kind" || key1 === "version")) {
                const err13 = { instancePath: instancePath + "/memoryProtocol", schemaPath: "#/properties/memoryProtocol/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data2.kind !== void 0) {
              let data3 = data2.kind;
              if (typeof data3 !== "string") {
                const err14 = { instancePath: instancePath + "/memoryProtocol/kind", schemaPath: "#/properties/memoryProtocol/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              if ("structured" !== data3) {
                const err15 = { instancePath: instancePath + "/memoryProtocol/kind", schemaPath: "#/properties/memoryProtocol/properties/kind/const", keyword: "const", params: { allowedValue: "structured" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data2.version !== void 0) {
              let data4 = data2.version;
              if (!(typeof data4 == "number" && isFinite(data4))) {
                const err16 = { instancePath: instancePath + "/memoryProtocol/version", schemaPath: "#/properties/memoryProtocol/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              if (1 !== data4) {
                const err17 = { instancePath: instancePath + "/memoryProtocol/version", schemaPath: "#/properties/memoryProtocol/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/memoryProtocol", schemaPath: "#/properties/memoryProtocol/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.modelContextProtocol !== void 0) {
          let data5 = data.modelContextProtocol;
          if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
            if (data5.kind === void 0) {
              const err19 = { instancePath: instancePath + "/modelContextProtocol", schemaPath: "#/properties/modelContextProtocol/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data5.version === void 0) {
              const err20 = { instancePath: instancePath + "/modelContextProtocol", schemaPath: "#/properties/modelContextProtocol/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            for (const key2 in data5) {
              if (!(key2 === "kind" || key2 === "version")) {
                const err21 = { instancePath: instancePath + "/modelContextProtocol", schemaPath: "#/properties/modelContextProtocol/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data5.kind !== void 0) {
              let data6 = data5.kind;
              if (typeof data6 !== "string") {
                const err22 = { instancePath: instancePath + "/modelContextProtocol/kind", schemaPath: "#/properties/modelContextProtocol/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              if ("trajectory-layered" !== data6) {
                const err23 = { instancePath: instancePath + "/modelContextProtocol/kind", schemaPath: "#/properties/modelContextProtocol/properties/kind/const", keyword: "const", params: { allowedValue: "trajectory-layered" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data5.version !== void 0) {
              let data7 = data5.version;
              if (!(typeof data7 == "number" && isFinite(data7))) {
                const err24 = { instancePath: instancePath + "/modelContextProtocol/version", schemaPath: "#/properties/modelContextProtocol/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              if (1 !== data7) {
                const err25 = { instancePath: instancePath + "/modelContextProtocol/version", schemaPath: "#/properties/modelContextProtocol/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            }
          } else {
            const err26 = { instancePath: instancePath + "/modelContextProtocol", schemaPath: "#/properties/modelContextProtocol/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.contextRetrievalProtocol !== void 0) {
          let data8 = data.contextRetrievalProtocol;
          if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
            if (data8.kind === void 0) {
              const err27 = { instancePath: instancePath + "/contextRetrievalProtocol", schemaPath: "#/properties/contextRetrievalProtocol/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data8.version === void 0) {
              const err28 = { instancePath: instancePath + "/contextRetrievalProtocol", schemaPath: "#/properties/contextRetrievalProtocol/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            for (const key3 in data8) {
              if (!(key3 === "kind" || key3 === "version")) {
                const err29 = { instancePath: instancePath + "/contextRetrievalProtocol", schemaPath: "#/properties/contextRetrievalProtocol/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data8.kind !== void 0) {
              let data9 = data8.kind;
              if (typeof data9 !== "string") {
                const err30 = { instancePath: instancePath + "/contextRetrievalProtocol/kind", schemaPath: "#/properties/contextRetrievalProtocol/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
              if ("bm25-lite" !== data9) {
                const err31 = { instancePath: instancePath + "/contextRetrievalProtocol/kind", schemaPath: "#/properties/contextRetrievalProtocol/properties/kind/const", keyword: "const", params: { allowedValue: "bm25-lite" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data8.version !== void 0) {
              let data10 = data8.version;
              if (!(typeof data10 == "number" && isFinite(data10))) {
                const err32 = { instancePath: instancePath + "/contextRetrievalProtocol/version", schemaPath: "#/properties/contextRetrievalProtocol/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              if (1 !== data10) {
                const err33 = { instancePath: instancePath + "/contextRetrievalProtocol/version", schemaPath: "#/properties/contextRetrievalProtocol/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
          } else {
            const err34 = { instancePath: instancePath + "/contextRetrievalProtocol", schemaPath: "#/properties/contextRetrievalProtocol/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data.profile !== void 0) {
          let data11 = data.profile;
          if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
            if (data11.id === void 0) {
              const err35 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/GoalSnapshotProfileV1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            if (data11.systemPrompt === void 0) {
              const err36 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/GoalSnapshotProfileV1/required", keyword: "required", params: { missingProperty: "systemPrompt" }, message: "must have required property 'systemPrompt'" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data11.instructions === void 0) {
              const err37 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/GoalSnapshotProfileV1/required", keyword: "required", params: { missingProperty: "instructions" }, message: "must have required property 'instructions'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data11.toolIds === void 0) {
              const err38 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/GoalSnapshotProfileV1/required", keyword: "required", params: { missingProperty: "toolIds" }, message: "must have required property 'toolIds'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            for (const key4 in data11) {
              if (!(key4 === "id" || key4 === "name" || key4 === "description" || key4 === "systemPrompt" || key4 === "instructions" || key4 === "toolIds")) {
                const err39 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/GoalSnapshotProfileV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data11.id !== void 0) {
              if (typeof data11.id !== "string") {
                const err40 = { instancePath: instancePath + "/profile/id", schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data11.name !== void 0) {
              if (typeof data11.name !== "string") {
                const err41 = { instancePath: instancePath + "/profile/name", schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
            if (data11.description !== void 0) {
              if (typeof data11.description !== "string") {
                const err42 = { instancePath: instancePath + "/profile/description", schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
            }
            if (data11.systemPrompt !== void 0) {
              if (typeof data11.systemPrompt !== "string") {
                const err43 = { instancePath: instancePath + "/profile/systemPrompt", schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/systemPrompt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            }
            if (data11.instructions !== void 0) {
              let data16 = data11.instructions;
              if (Array.isArray(data16)) {
                const len0 = data16.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (typeof data16[i0] !== "string") {
                    const err44 = { instancePath: instancePath + "/profile/instructions/" + i0, schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/instructions/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                }
              } else {
                const err45 = { instancePath: instancePath + "/profile/instructions", schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/instructions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data11.toolIds !== void 0) {
              let data18 = data11.toolIds;
              if (Array.isArray(data18)) {
                const len1 = data18.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  if (typeof data18[i1] !== "string") {
                    const err46 = { instancePath: instancePath + "/profile/toolIds/" + i1, schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/toolIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                }
              } else {
                const err47 = { instancePath: instancePath + "/profile/toolIds", schemaPath: "#/definitions/GoalSnapshotProfileV1/properties/toolIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
          } else {
            const err48 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/GoalSnapshotProfileV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
        if (data.executionPolicy !== void 0) {
          let data20 = data.executionPolicy;
          if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
            if (data20.maxSteps === void 0) {
              const err49 = { instancePath: instancePath + "/executionPolicy", schemaPath: "#/properties/executionPolicy/required", keyword: "required", params: { missingProperty: "maxSteps" }, message: "must have required property 'maxSteps'" };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
            for (const key5 in data20) {
              if (!(key5 === "maxSteps")) {
                const err50 = { instancePath: instancePath + "/executionPolicy", schemaPath: "#/properties/executionPolicy/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
            }
            if (data20.maxSteps !== void 0) {
              let data21 = data20.maxSteps;
              if (!(typeof data21 == "number" && isFinite(data21))) {
                const err51 = { instancePath: instancePath + "/executionPolicy/maxSteps", schemaPath: "#/properties/executionPolicy/properties/maxSteps/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
          } else {
            const err52 = { instancePath: instancePath + "/executionPolicy", schemaPath: "#/properties/executionPolicy/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
        }
      } else {
        const err53 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    var schema16 = { "type": "object", "properties": { "nextRunMode": { "type": "string", "const": "plan" }, "commitRevision": { "type": "number", "description": "Goal \u7EA7\u5355\u8C03\u63D0\u4EA4\u4FEE\u8BA2\uFF1B\u7701\u7565\u7B49\u540C 0\u3002" }, "inputLedger": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotSessionInputV1" }, "description": "\u5DF2\u53D7\u7406\u8F93\u5165\u8D26\u672C\uFF1B\u7701\u7565\u8868\u793A\u5C1A\u672A\u53D7\u7406\u8F93\u5165\u3002" }, "messageQueue": { "$ref": "#/definitions/GoalSnapshotMessageQueueV1", "description": "\u5F85\u5904\u7406\u666E\u901A\u6D88\u606F\u961F\u5217\uFF1B\u7701\u7565\u8868\u793A\u7A7A\u961F\u5217\u3002" }, "workflow": { "$ref": "#/definitions/GoalSnapshotWorkflowV1" }, "messages": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotMessageV1" } }, "run": { "$ref": "#/definitions/GoalSnapshotRunStateV1" }, "modelSelection": { "$ref": "#/definitions/GoalSnapshotModelSelectionV1" }, "goalPlan": { "$ref": "#/definitions/GoalSnapshotGoalPlanV1" }, "completedRuns": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotCompletedRunV1" } } }, "required": ["workflow", "messages", "run", "modelSelection", "completedRuns"], "additionalProperties": false, "description": "Snapshot \u4E2D\u7684 Goal \u72B6\u6001\u3002" };
    var schema17 = { "type": "object", "properties": { "inputId": { "type": "string" }, "kind": { "type": "string", "enum": ["message", "steer", "interrupt", "respond", "resume", "queue_control"] }, "digest": { "type": "string" }, "sequence": { "type": "number" }, "status": { "type": "string", "enum": ["pending", "applied", "cleared"] }, "admittedAtRevision": { "type": "number" }, "targetRunId": { "type": "string" }, "appliedRunId": { "type": "string" }, "messageIndex": { "type": "number" } }, "required": ["inputId", "kind", "digest", "sequence", "status", "admittedAtRevision"], "additionalProperties": false, "description": "Snapshot \u4E2D\u4E00\u6761\u5DF2\u53D7\u7406\u8F93\u5165\u7684\u8D26\u672C\u8BB0\u5F55\u3002" };
    var schema64 = { "type": "object", "properties": { "provider": { "type": "string" }, "profileId": { "type": "string" }, "modelId": { "type": "string" }, "executionApi": { "type": "string", "const": "openai-completions" }, "structuredOutputMode": { "type": "string", "enum": ["strict", "prompt_only", "two_stage"] }, "contextWindowTokens": { "type": "number" }, "maxOutputTokens": { "type": "number" }, "reasoning": { "type": "boolean", "description": "\u6A21\u578B\u662F\u5426\u652F\u6301\u63A8\u7406\u5185\u5BB9\u3002" }, "vision": { "type": "boolean", "description": "\u6A21\u578B\u662F\u5426\u63A5\u53D7\u56FE\u50CF\u7B49\u89C6\u89C9\u8F93\u5165\u3002" }, "supportsRequiredToolChoice": { "type": "boolean", "description": "Chat Completions \u8DEF\u5F84\u662F\u5426\u63A5\u53D7 `tool_choice: required`\u3002" }, "inputEstimator": { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "character-v1" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "token-encoding" }, "encoding": { "type": "string", "enum": ["cl100k_base", "o200k_base"] } }, "required": ["kind", "encoding"], "additionalProperties": false }] } }, "required": ["provider", "modelId", "inputEstimator"], "additionalProperties": false, "description": "Snapshot v1 \u4E2D\u6301\u4E45\u5316\u7684\u6A21\u578B\u9009\u62E9\u4E0E\u6267\u884C\u534F\u8BAE\u3002" };
    var schema67 = { "type": "object", "properties": { "runId": { "type": "string", "description": "\u5DF2\u5F52\u6863 Run \u7684\u7A33\u5B9A\u8EAB\u4EFD\u3002" }, "status": { "type": "string", "enum": ["completed", "failed", "cancelled"], "description": "\u5DF2\u5F52\u6863 Run \u7684\u771F\u5B9E\u7EC8\u6001\u3002" }, "stepCount": { "type": "number", "description": "\u5F52\u6863\u65F6\u5DF2\u63D0\u4EA4\u7684 Step \u6570\u91CF\u3002" }, "committedThroughSequence": { "type": "number", "description": "\u8BE5 Run \u7684\u8F68\u8FF9\u53EF\u89C1\u8FB9\u754C\u3002" }, "messageRange": { "type": "object", "properties": { "start": { "type": "number" }, "end": { "type": "number" } }, "required": ["start", "end"], "additionalProperties": false, "description": "\u8BE5 Run \u5728 Goal \u6D88\u606F\u6570\u7EC4\u4E2D\u7684\u534A\u5F00\u533A\u95F4\u3002" }, "continuation": { "type": "object", "properties": { "messageId": { "type": "string" }, "content": { "type": "string" }, "nextRunId": { "type": "string" } }, "required": ["messageId", "content", "nextRunId"], "additionalProperties": false, "description": "\u6D4F\u89C8\u5668\u7EED\u5199\u7684\u6301\u4E45\u5316\u5E42\u7B49\u6536\u636E\u3002" } }, "required": ["runId", "status", "stepCount", "committedThroughSequence", "messageRange"], "additionalProperties": false, "description": "Snapshot \u4E2D\u5DF2\u5F52\u6863 Run \u7684\u6700\u5C0F\u5386\u53F2\u6458\u8981\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var schema18 = { "type": "object", "properties": { "revision": { "type": "number" }, "items": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotSessionQueueItemV1" } }, "pause": { "type": "object", "properties": { "reason": { "type": "string", "enum": ["run_failed", "user_interrupt"] }, "runId": { "type": "string" } }, "required": ["reason", "runId"], "additionalProperties": false } }, "required": ["revision", "items"], "additionalProperties": false, "description": "Snapshot \u4E2D\u7684\u5F85\u5904\u7406\u6D88\u606F\u961F\u5217\u3001\u4FEE\u8BA2\u4E0E\u6682\u505C\u72B6\u6001\u3002" };
    function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (!(key0 === "revision" || key0 === "items" || key0 === "pause")) {
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
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.items !== void 0) {
          let data1 = data.items;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                if (data2.inputId === void 0) {
                  const err4 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (data2.content === void 0) {
                  const err5 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                if (data2.sequence === void 0) {
                  const err6 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!(key1 === "inputId" || key1 === "content" || key1 === "sequence")) {
                    const err7 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err7];
                    } else {
                      vErrors.push(err7);
                    }
                    errors++;
                  }
                }
                if (data2.inputId !== void 0) {
                  if (typeof data2.inputId !== "string") {
                    const err8 = { instancePath: instancePath + "/items/" + i0 + "/inputId", schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err8];
                    } else {
                      vErrors.push(err8);
                    }
                    errors++;
                  }
                }
                if (data2.content !== void 0) {
                  if (typeof data2.content !== "string") {
                    const err9 = { instancePath: instancePath + "/items/" + i0 + "/content", schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data2.sequence !== void 0) {
                  let data5 = data2.sequence;
                  if (!(typeof data5 == "number" && isFinite(data5))) {
                    const err10 = { instancePath: instancePath + "/items/" + i0 + "/sequence", schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/properties/sequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                }
              } else {
                const err11 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionQueueItemV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
          } else {
            const err12 = { instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.pause !== void 0) {
          let data6 = data.pause;
          if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
            if (data6.reason === void 0) {
              const err13 = { instancePath: instancePath + "/pause", schemaPath: "#/properties/pause/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data6.runId === void 0) {
              const err14 = { instancePath: instancePath + "/pause", schemaPath: "#/properties/pause/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            for (const key2 in data6) {
              if (!(key2 === "reason" || key2 === "runId")) {
                const err15 = { instancePath: instancePath + "/pause", schemaPath: "#/properties/pause/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data6.reason !== void 0) {
              let data7 = data6.reason;
              if (typeof data7 !== "string") {
                const err16 = { instancePath: instancePath + "/pause/reason", schemaPath: "#/properties/pause/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              if (!(data7 === "run_failed" || data7 === "user_interrupt")) {
                const err17 = { instancePath: instancePath + "/pause/reason", schemaPath: "#/properties/pause/properties/reason/enum", keyword: "enum", params: { allowedValues: schema18.properties.pause.properties.reason.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data6.runId !== void 0) {
              if (typeof data6.runId !== "string") {
                const err18 = { instancePath: instancePath + "/pause/runId", schemaPath: "#/properties/pause/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/pause", schemaPath: "#/properties/pause/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
      validate15.errors = vErrors;
      return errors === 0;
    }
    var schema21 = { "anyOf": [{ "type": "object", "properties": { "role": { "type": "string", "const": "user" }, "content": { "type": "string" }, "messageId": { "type": "string" }, "runId": { "type": "string" }, "position": { "$ref": "#/definitions/GoalSnapshotMessagePositionV1", "description": "\u6D88\u606F\u4E4B\u524D\u6700\u540E\u4E00\u6761\u5DF2\u63D0\u4EA4 Run \u4E8B\u5B9E\u53CA\u540C\u951A\u70B9 Snapshot \u6B21\u5E8F\u3002" }, "source": { "$ref": "#/definitions/GoalSnapshotMessageSourceV1" } }, "required": ["role", "content", "messageId", "runId", "position", "source"], "additionalProperties": false }, { "type": "object", "properties": { "role": { "type": "string", "const": "assistant" }, "assistant": { "type": "object", "properties": { "profileId": { "type": "string" } }, "required": ["profileId"], "additionalProperties": false }, "content": { "type": "string" }, "messageId": { "type": "string" }, "runId": { "type": "string" }, "position": { "$ref": "#/definitions/GoalSnapshotMessagePositionV1", "description": "\u6D88\u606F\u4E4B\u524D\u6700\u540E\u4E00\u6761\u5DF2\u63D0\u4EA4 Run \u4E8B\u5B9E\u53CA\u540C\u951A\u70B9 Snapshot \u6B21\u5E8F\u3002" }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "source": { "$ref": "#/definitions/GoalSnapshotMessageSourceV1" } }, "required": ["role", "assistant", "content", "messageId", "runId", "position", "purpose", "source"], "additionalProperties": false }], "description": "Snapshot \u4E2D\u6309\u65F6\u95F4\u987A\u5E8F\u4FDD\u5B58\u7684\u771F\u5B9E\u4F1A\u8BDD\u6D88\u606F\u3002" };
    function validate17(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.role === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.messageId === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.position === void 0) {
          const err4 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err5 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "role" || key0 === "content" || key0 === "messageId" || key0 === "runId" || key0 === "position" || key0 === "source")) {
            const err6 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.role !== void 0) {
          let data0 = data.role;
          if (typeof data0 !== "string") {
            const err7 = { instancePath: instancePath + "/role", schemaPath: "#/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if ("user" !== data0) {
            const err8 = { instancePath: instancePath + "/role", schemaPath: "#/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "user" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          if (typeof data.content !== "string") {
            const err9 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/0/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.messageId !== void 0) {
          if (typeof data.messageId !== "string") {
            const err10 = { instancePath: instancePath + "/messageId", schemaPath: "#/anyOf/0/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          if (typeof data.runId !== "string") {
            const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.position !== void 0) {
          let data4 = data.position;
          if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
            if (data4.afterSequence === void 0) {
              const err12 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/required", keyword: "required", params: { missingProperty: "afterSequence" }, message: "must have required property 'afterSequence'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data4.order === void 0) {
              const err13 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            for (const key1 in data4) {
              if (!(key1 === "afterSequence" || key1 === "order")) {
                const err14 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data4.afterSequence !== void 0) {
              let data5 = data4.afterSequence;
              if (!(typeof data5 == "number" && isFinite(data5))) {
                const err15 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/properties/afterSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data4.order !== void 0) {
              let data6 = data4.order;
              if (!(typeof data6 == "number" && isFinite(data6))) {
                const err16 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/properties/order/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
          } else {
            const err17 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.source !== void 0) {
          let data7 = data.source;
          const _errs22 = errors;
          let valid5 = false;
          const _errs23 = errors;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.kind === void 0) {
              const err18 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data7.goalId === void 0) {
              const err19 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            for (const key2 in data7) {
              if (!(key2 === "kind" || key2 === "goalId")) {
                const err20 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data7.kind !== void 0) {
              let data8 = data7.kind;
              if (typeof data8 !== "string") {
                const err21 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
              if ("goal_intent" !== data8) {
                const err22 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "goal_intent" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data7.goalId !== void 0) {
              if (typeof data7.goalId !== "string") {
                const err23 = { instancePath: instancePath + "/source/goalId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
          } else {
            const err24 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          var _valid1 = _errs23 === errors;
          valid5 = valid5 || _valid1;
          if (!valid5) {
            const _errs30 = errors;
            if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
              if (data7.kind === void 0) {
                const err25 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
              if (data7.inputId === void 0) {
                const err26 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              for (const key3 in data7) {
                if (!(key3 === "kind" || key3 === "inputId")) {
                  const err27 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              }
              if (data7.kind !== void 0) {
                let data10 = data7.kind;
                if (typeof data10 !== "string") {
                  const err28 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                if ("user_input" !== data10) {
                  const err29 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "user_input" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              }
              if (data7.inputId !== void 0) {
                if (typeof data7.inputId !== "string") {
                  const err30 = { instancePath: instancePath + "/source/inputId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              }
            } else {
              const err31 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            var _valid1 = _errs30 === errors;
            valid5 = valid5 || _valid1;
            if (!valid5) {
              const _errs37 = errors;
              if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                if (data7.kind === void 0) {
                  const err32 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                if (data7.requestId === void 0) {
                  const err33 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                for (const key4 in data7) {
                  if (!(key4 === "kind" || key4 === "requestId")) {
                    const err34 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
                if (data7.kind !== void 0) {
                  let data12 = data7.kind;
                  if (typeof data12 !== "string") {
                    const err35 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                  if ("interaction_response" !== data12) {
                    const err36 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "interaction_response" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                }
                if (data7.requestId !== void 0) {
                  if (typeof data7.requestId !== "string") {
                    const err37 = { instancePath: instancePath + "/source/requestId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
              } else {
                const err38 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
              var _valid1 = _errs37 === errors;
              valid5 = valid5 || _valid1;
              if (!valid5) {
                const _errs44 = errors;
                if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                  if (data7.kind === void 0) {
                    const err39 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                  if (data7.modelCallId === void 0) {
                    const err40 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/required", keyword: "required", params: { missingProperty: "modelCallId" }, message: "must have required property 'modelCallId'" };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                  if (data7.blockIndex === void 0) {
                    const err41 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/required", keyword: "required", params: { missingProperty: "blockIndex" }, message: "must have required property 'blockIndex'" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                  for (const key5 in data7) {
                    if (!(key5 === "kind" || key5 === "modelCallId" || key5 === "blockIndex")) {
                      const err42 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err42];
                      } else {
                        vErrors.push(err42);
                      }
                      errors++;
                    }
                  }
                  if (data7.kind !== void 0) {
                    let data14 = data7.kind;
                    if (typeof data14 !== "string") {
                      const err43 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err43];
                      } else {
                        vErrors.push(err43);
                      }
                      errors++;
                    }
                    if ("model_text" !== data14) {
                      const err44 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "model_text" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err44];
                      } else {
                        vErrors.push(err44);
                      }
                      errors++;
                    }
                  }
                  if (data7.modelCallId !== void 0) {
                    if (typeof data7.modelCallId !== "string") {
                      const err45 = { instancePath: instancePath + "/source/modelCallId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/modelCallId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err45];
                      } else {
                        vErrors.push(err45);
                      }
                      errors++;
                    }
                  }
                  if (data7.blockIndex !== void 0) {
                    let data16 = data7.blockIndex;
                    if (!(typeof data16 == "number" && isFinite(data16))) {
                      const err46 = { instancePath: instancePath + "/source/blockIndex", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/blockIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                      if (vErrors === null) {
                        vErrors = [err46];
                      } else {
                        vErrors.push(err46);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err47 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
                var _valid1 = _errs44 === errors;
                valid5 = valid5 || _valid1;
                if (!valid5) {
                  const _errs53 = errors;
                  if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                    if (data7.kind === void 0) {
                      const err48 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err48];
                      } else {
                        vErrors.push(err48);
                      }
                      errors++;
                    }
                    if (data7.executionUnitId === void 0) {
                      const err49 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                    if (data7.blockIndex === void 0) {
                      const err50 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/required", keyword: "required", params: { missingProperty: "blockIndex" }, message: "must have required property 'blockIndex'" };
                      if (vErrors === null) {
                        vErrors = [err50];
                      } else {
                        vErrors.push(err50);
                      }
                      errors++;
                    }
                    for (const key6 in data7) {
                      if (!(key6 === "kind" || key6 === "executionUnitId" || key6 === "blockIndex")) {
                        const err51 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err51];
                        } else {
                          vErrors.push(err51);
                        }
                        errors++;
                      }
                    }
                    if (data7.kind !== void 0) {
                      let data17 = data7.kind;
                      if (typeof data17 !== "string") {
                        const err52 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err52];
                        } else {
                          vErrors.push(err52);
                        }
                        errors++;
                      }
                      if ("stage_output" !== data17) {
                        const err53 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "stage_output" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err53];
                        } else {
                          vErrors.push(err53);
                        }
                        errors++;
                      }
                    }
                    if (data7.executionUnitId !== void 0) {
                      if (typeof data7.executionUnitId !== "string") {
                        const err54 = { instancePath: instancePath + "/source/executionUnitId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err54];
                        } else {
                          vErrors.push(err54);
                        }
                        errors++;
                      }
                    }
                    if (data7.blockIndex !== void 0) {
                      let data19 = data7.blockIndex;
                      if (!(typeof data19 == "number" && isFinite(data19))) {
                        const err55 = { instancePath: instancePath + "/source/blockIndex", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/blockIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err55];
                        } else {
                          vErrors.push(err55);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err56 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err56];
                    } else {
                      vErrors.push(err56);
                    }
                    errors++;
                  }
                  var _valid1 = _errs53 === errors;
                  valid5 = valid5 || _valid1;
                  if (!valid5) {
                    const _errs62 = errors;
                    if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                      if (data7.kind === void 0) {
                        const err57 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err57];
                        } else {
                          vErrors.push(err57);
                        }
                        errors++;
                      }
                      if (data7.candidateId === void 0) {
                        const err58 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/required", keyword: "required", params: { missingProperty: "candidateId" }, message: "must have required property 'candidateId'" };
                        if (vErrors === null) {
                          vErrors = [err58];
                        } else {
                          vErrors.push(err58);
                        }
                        errors++;
                      }
                      for (const key7 in data7) {
                        if (!(key7 === "kind" || key7 === "candidateId")) {
                          const err59 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err59];
                          } else {
                            vErrors.push(err59);
                          }
                          errors++;
                        }
                      }
                      if (data7.kind !== void 0) {
                        let data20 = data7.kind;
                        if (typeof data20 !== "string") {
                          const err60 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err60];
                          } else {
                            vErrors.push(err60);
                          }
                          errors++;
                        }
                        if ("completion_candidate" !== data20) {
                          const err61 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "completion_candidate" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err61];
                          } else {
                            vErrors.push(err61);
                          }
                          errors++;
                        }
                      }
                      if (data7.candidateId !== void 0) {
                        if (typeof data7.candidateId !== "string") {
                          const err62 = { instancePath: instancePath + "/source/candidateId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/properties/candidateId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err62];
                          } else {
                            vErrors.push(err62);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err63 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err63];
                      } else {
                        vErrors.push(err63);
                      }
                      errors++;
                    }
                    var _valid1 = _errs62 === errors;
                    valid5 = valid5 || _valid1;
                    if (!valid5) {
                      const _errs69 = errors;
                      if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                        if (data7.kind === void 0) {
                          const err64 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err64];
                          } else {
                            vErrors.push(err64);
                          }
                          errors++;
                        }
                        if (data7.actionId === void 0) {
                          const err65 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                          if (vErrors === null) {
                            vErrors = [err65];
                          } else {
                            vErrors.push(err65);
                          }
                          errors++;
                        }
                        for (const key8 in data7) {
                          if (!(key8 === "kind" || key8 === "actionId")) {
                            const err66 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err66];
                            } else {
                              vErrors.push(err66);
                            }
                            errors++;
                          }
                        }
                        if (data7.kind !== void 0) {
                          let data22 = data7.kind;
                          if (typeof data22 !== "string") {
                            const err67 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err67];
                            } else {
                              vErrors.push(err67);
                            }
                            errors++;
                          }
                          if ("host_execution" !== data22) {
                            const err68 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "host_execution" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err68];
                            } else {
                              vErrors.push(err68);
                            }
                            errors++;
                          }
                        }
                        if (data7.actionId !== void 0) {
                          if (typeof data7.actionId !== "string") {
                            const err69 = { instancePath: instancePath + "/source/actionId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err69];
                            } else {
                              vErrors.push(err69);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err70 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err70];
                        } else {
                          vErrors.push(err70);
                        }
                        errors++;
                      }
                      var _valid1 = _errs69 === errors;
                      valid5 = valid5 || _valid1;
                      if (!valid5) {
                        const _errs76 = errors;
                        if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                          if (data7.kind === void 0) {
                            const err71 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                            if (vErrors === null) {
                              vErrors = [err71];
                            } else {
                              vErrors.push(err71);
                            }
                            errors++;
                          }
                          if (data7.noticeId === void 0) {
                            const err72 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/required", keyword: "required", params: { missingProperty: "noticeId" }, message: "must have required property 'noticeId'" };
                            if (vErrors === null) {
                              vErrors = [err72];
                            } else {
                              vErrors.push(err72);
                            }
                            errors++;
                          }
                          for (const key9 in data7) {
                            if (!(key9 === "kind" || key9 === "noticeId")) {
                              const err73 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err73];
                              } else {
                                vErrors.push(err73);
                              }
                              errors++;
                            }
                          }
                          if (data7.kind !== void 0) {
                            let data24 = data7.kind;
                            if (typeof data24 !== "string") {
                              const err74 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err74];
                              } else {
                                vErrors.push(err74);
                              }
                              errors++;
                            }
                            if ("runtime_notice" !== data24) {
                              const err75 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "runtime_notice" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err75];
                              } else {
                                vErrors.push(err75);
                              }
                              errors++;
                            }
                          }
                          if (data7.noticeId !== void 0) {
                            if (typeof data7.noticeId !== "string") {
                              const err76 = { instancePath: instancePath + "/source/noticeId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/properties/noticeId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err76];
                              } else {
                                vErrors.push(err76);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err77 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err77];
                          } else {
                            vErrors.push(err77);
                          }
                          errors++;
                        }
                        var _valid1 = _errs76 === errors;
                        valid5 = valid5 || _valid1;
                      }
                    }
                  }
                }
              }
            }
          }
          if (!valid5) {
            const err78 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err78];
            } else {
              vErrors.push(err78);
            }
            errors++;
          } else {
            errors = _errs22;
            if (vErrors !== null) {
              if (_errs22) {
                vErrors.length = _errs22;
              } else {
                vErrors = null;
              }
            }
          }
        }
      } else {
        const err79 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err79];
        } else {
          vErrors.push(err79);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs83 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.role === void 0) {
            const err80 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
            if (vErrors === null) {
              vErrors = [err80];
            } else {
              vErrors.push(err80);
            }
            errors++;
          }
          if (data.assistant === void 0) {
            const err81 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "assistant" }, message: "must have required property 'assistant'" };
            if (vErrors === null) {
              vErrors = [err81];
            } else {
              vErrors.push(err81);
            }
            errors++;
          }
          if (data.content === void 0) {
            const err82 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
            if (vErrors === null) {
              vErrors = [err82];
            } else {
              vErrors.push(err82);
            }
            errors++;
          }
          if (data.messageId === void 0) {
            const err83 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
            if (vErrors === null) {
              vErrors = [err83];
            } else {
              vErrors.push(err83);
            }
            errors++;
          }
          if (data.runId === void 0) {
            const err84 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
            if (vErrors === null) {
              vErrors = [err84];
            } else {
              vErrors.push(err84);
            }
            errors++;
          }
          if (data.position === void 0) {
            const err85 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
            if (vErrors === null) {
              vErrors = [err85];
            } else {
              vErrors.push(err85);
            }
            errors++;
          }
          if (data.purpose === void 0) {
            const err86 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "purpose" }, message: "must have required property 'purpose'" };
            if (vErrors === null) {
              vErrors = [err86];
            } else {
              vErrors.push(err86);
            }
            errors++;
          }
          if (data.source === void 0) {
            const err87 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
            if (vErrors === null) {
              vErrors = [err87];
            } else {
              vErrors.push(err87);
            }
            errors++;
          }
          for (const key10 in data) {
            if (!(key10 === "role" || key10 === "assistant" || key10 === "content" || key10 === "messageId" || key10 === "runId" || key10 === "position" || key10 === "purpose" || key10 === "source")) {
              const err88 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err88];
              } else {
                vErrors.push(err88);
              }
              errors++;
            }
          }
          if (data.role !== void 0) {
            let data26 = data.role;
            if (typeof data26 !== "string") {
              const err89 = { instancePath: instancePath + "/role", schemaPath: "#/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err89];
              } else {
                vErrors.push(err89);
              }
              errors++;
            }
            if ("assistant" !== data26) {
              const err90 = { instancePath: instancePath + "/role", schemaPath: "#/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "assistant" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err90];
              } else {
                vErrors.push(err90);
              }
              errors++;
            }
          }
          if (data.assistant !== void 0) {
            let data27 = data.assistant;
            if (data27 && typeof data27 == "object" && !Array.isArray(data27)) {
              if (data27.profileId === void 0) {
                const err91 = { instancePath: instancePath + "/assistant", schemaPath: "#/anyOf/1/properties/assistant/required", keyword: "required", params: { missingProperty: "profileId" }, message: "must have required property 'profileId'" };
                if (vErrors === null) {
                  vErrors = [err91];
                } else {
                  vErrors.push(err91);
                }
                errors++;
              }
              for (const key11 in data27) {
                if (!(key11 === "profileId")) {
                  const err92 = { instancePath: instancePath + "/assistant", schemaPath: "#/anyOf/1/properties/assistant/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err92];
                  } else {
                    vErrors.push(err92);
                  }
                  errors++;
                }
              }
              if (data27.profileId !== void 0) {
                if (typeof data27.profileId !== "string") {
                  const err93 = { instancePath: instancePath + "/assistant/profileId", schemaPath: "#/anyOf/1/properties/assistant/properties/profileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err93];
                  } else {
                    vErrors.push(err93);
                  }
                  errors++;
                }
              }
            } else {
              const err94 = { instancePath: instancePath + "/assistant", schemaPath: "#/anyOf/1/properties/assistant/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err94];
              } else {
                vErrors.push(err94);
              }
              errors++;
            }
          }
          if (data.content !== void 0) {
            if (typeof data.content !== "string") {
              const err95 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/1/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err95];
              } else {
                vErrors.push(err95);
              }
              errors++;
            }
          }
          if (data.messageId !== void 0) {
            if (typeof data.messageId !== "string") {
              const err96 = { instancePath: instancePath + "/messageId", schemaPath: "#/anyOf/1/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err96];
              } else {
                vErrors.push(err96);
              }
              errors++;
            }
          }
          if (data.runId !== void 0) {
            if (typeof data.runId !== "string") {
              const err97 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err97];
              } else {
                vErrors.push(err97);
              }
              errors++;
            }
          }
          if (data.position !== void 0) {
            let data32 = data.position;
            if (data32 && typeof data32 == "object" && !Array.isArray(data32)) {
              if (data32.afterSequence === void 0) {
                const err98 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/required", keyword: "required", params: { missingProperty: "afterSequence" }, message: "must have required property 'afterSequence'" };
                if (vErrors === null) {
                  vErrors = [err98];
                } else {
                  vErrors.push(err98);
                }
                errors++;
              }
              if (data32.order === void 0) {
                const err99 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
                if (vErrors === null) {
                  vErrors = [err99];
                } else {
                  vErrors.push(err99);
                }
                errors++;
              }
              for (const key12 in data32) {
                if (!(key12 === "afterSequence" || key12 === "order")) {
                  const err100 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err100];
                  } else {
                    vErrors.push(err100);
                  }
                  errors++;
                }
              }
              if (data32.afterSequence !== void 0) {
                let data33 = data32.afterSequence;
                if (!(typeof data33 == "number" && isFinite(data33))) {
                  const err101 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/properties/afterSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err101];
                  } else {
                    vErrors.push(err101);
                  }
                  errors++;
                }
              }
              if (data32.order !== void 0) {
                let data34 = data32.order;
                if (!(typeof data34 == "number" && isFinite(data34))) {
                  const err102 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/properties/order/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err102];
                  } else {
                    vErrors.push(err102);
                  }
                  errors++;
                }
              }
            } else {
              const err103 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/GoalSnapshotMessagePositionV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err103];
              } else {
                vErrors.push(err103);
              }
              errors++;
            }
          }
          if (data.purpose !== void 0) {
            let data35 = data.purpose;
            if (typeof data35 !== "string") {
              const err104 = { instancePath: instancePath + "/purpose", schemaPath: "#/anyOf/1/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err104];
              } else {
                vErrors.push(err104);
              }
              errors++;
            }
            if (!(data35 === "process" || data35 === "answer" || data35 === "notice")) {
              const err105 = { instancePath: instancePath + "/purpose", schemaPath: "#/anyOf/1/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema21.anyOf[1].properties.purpose.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err105];
              } else {
                vErrors.push(err105);
              }
              errors++;
            }
          }
          if (data.source !== void 0) {
            let data36 = data.source;
            const _errs111 = errors;
            let valid19 = false;
            const _errs112 = errors;
            if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
              if (data36.kind === void 0) {
                const err106 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err106];
                } else {
                  vErrors.push(err106);
                }
                errors++;
              }
              if (data36.goalId === void 0) {
                const err107 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                if (vErrors === null) {
                  vErrors = [err107];
                } else {
                  vErrors.push(err107);
                }
                errors++;
              }
              for (const key13 in data36) {
                if (!(key13 === "kind" || key13 === "goalId")) {
                  const err108 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key13 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err108];
                  } else {
                    vErrors.push(err108);
                  }
                  errors++;
                }
              }
              if (data36.kind !== void 0) {
                let data37 = data36.kind;
                if (typeof data37 !== "string") {
                  const err109 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err109];
                  } else {
                    vErrors.push(err109);
                  }
                  errors++;
                }
                if ("goal_intent" !== data37) {
                  const err110 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "goal_intent" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err110];
                  } else {
                    vErrors.push(err110);
                  }
                  errors++;
                }
              }
              if (data36.goalId !== void 0) {
                if (typeof data36.goalId !== "string") {
                  const err111 = { instancePath: instancePath + "/source/goalId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err111];
                  } else {
                    vErrors.push(err111);
                  }
                  errors++;
                }
              }
            } else {
              const err112 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err112];
              } else {
                vErrors.push(err112);
              }
              errors++;
            }
            var _valid2 = _errs112 === errors;
            valid19 = valid19 || _valid2;
            if (!valid19) {
              const _errs119 = errors;
              if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                if (data36.kind === void 0) {
                  const err113 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err113];
                  } else {
                    vErrors.push(err113);
                  }
                  errors++;
                }
                if (data36.inputId === void 0) {
                  const err114 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                  if (vErrors === null) {
                    vErrors = [err114];
                  } else {
                    vErrors.push(err114);
                  }
                  errors++;
                }
                for (const key14 in data36) {
                  if (!(key14 === "kind" || key14 === "inputId")) {
                    const err115 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key14 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err115];
                    } else {
                      vErrors.push(err115);
                    }
                    errors++;
                  }
                }
                if (data36.kind !== void 0) {
                  let data39 = data36.kind;
                  if (typeof data39 !== "string") {
                    const err116 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err116];
                    } else {
                      vErrors.push(err116);
                    }
                    errors++;
                  }
                  if ("user_input" !== data39) {
                    const err117 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "user_input" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err117];
                    } else {
                      vErrors.push(err117);
                    }
                    errors++;
                  }
                }
                if (data36.inputId !== void 0) {
                  if (typeof data36.inputId !== "string") {
                    const err118 = { instancePath: instancePath + "/source/inputId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err118];
                    } else {
                      vErrors.push(err118);
                    }
                    errors++;
                  }
                }
              } else {
                const err119 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err119];
                } else {
                  vErrors.push(err119);
                }
                errors++;
              }
              var _valid2 = _errs119 === errors;
              valid19 = valid19 || _valid2;
              if (!valid19) {
                const _errs126 = errors;
                if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                  if (data36.kind === void 0) {
                    const err120 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err120];
                    } else {
                      vErrors.push(err120);
                    }
                    errors++;
                  }
                  if (data36.requestId === void 0) {
                    const err121 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
                    if (vErrors === null) {
                      vErrors = [err121];
                    } else {
                      vErrors.push(err121);
                    }
                    errors++;
                  }
                  for (const key15 in data36) {
                    if (!(key15 === "kind" || key15 === "requestId")) {
                      const err122 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key15 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err122];
                      } else {
                        vErrors.push(err122);
                      }
                      errors++;
                    }
                  }
                  if (data36.kind !== void 0) {
                    let data41 = data36.kind;
                    if (typeof data41 !== "string") {
                      const err123 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err123];
                      } else {
                        vErrors.push(err123);
                      }
                      errors++;
                    }
                    if ("interaction_response" !== data41) {
                      const err124 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "interaction_response" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err124];
                      } else {
                        vErrors.push(err124);
                      }
                      errors++;
                    }
                  }
                  if (data36.requestId !== void 0) {
                    if (typeof data36.requestId !== "string") {
                      const err125 = { instancePath: instancePath + "/source/requestId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err125];
                      } else {
                        vErrors.push(err125);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err126 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err126];
                  } else {
                    vErrors.push(err126);
                  }
                  errors++;
                }
                var _valid2 = _errs126 === errors;
                valid19 = valid19 || _valid2;
                if (!valid19) {
                  const _errs133 = errors;
                  if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                    if (data36.kind === void 0) {
                      const err127 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err127];
                      } else {
                        vErrors.push(err127);
                      }
                      errors++;
                    }
                    if (data36.modelCallId === void 0) {
                      const err128 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/required", keyword: "required", params: { missingProperty: "modelCallId" }, message: "must have required property 'modelCallId'" };
                      if (vErrors === null) {
                        vErrors = [err128];
                      } else {
                        vErrors.push(err128);
                      }
                      errors++;
                    }
                    if (data36.blockIndex === void 0) {
                      const err129 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/required", keyword: "required", params: { missingProperty: "blockIndex" }, message: "must have required property 'blockIndex'" };
                      if (vErrors === null) {
                        vErrors = [err129];
                      } else {
                        vErrors.push(err129);
                      }
                      errors++;
                    }
                    for (const key16 in data36) {
                      if (!(key16 === "kind" || key16 === "modelCallId" || key16 === "blockIndex")) {
                        const err130 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key16 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err130];
                        } else {
                          vErrors.push(err130);
                        }
                        errors++;
                      }
                    }
                    if (data36.kind !== void 0) {
                      let data43 = data36.kind;
                      if (typeof data43 !== "string") {
                        const err131 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err131];
                        } else {
                          vErrors.push(err131);
                        }
                        errors++;
                      }
                      if ("model_text" !== data43) {
                        const err132 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "model_text" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err132];
                        } else {
                          vErrors.push(err132);
                        }
                        errors++;
                      }
                    }
                    if (data36.modelCallId !== void 0) {
                      if (typeof data36.modelCallId !== "string") {
                        const err133 = { instancePath: instancePath + "/source/modelCallId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/modelCallId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err133];
                        } else {
                          vErrors.push(err133);
                        }
                        errors++;
                      }
                    }
                    if (data36.blockIndex !== void 0) {
                      let data45 = data36.blockIndex;
                      if (!(typeof data45 == "number" && isFinite(data45))) {
                        const err134 = { instancePath: instancePath + "/source/blockIndex", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/properties/blockIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err134];
                        } else {
                          vErrors.push(err134);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err135 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err135];
                    } else {
                      vErrors.push(err135);
                    }
                    errors++;
                  }
                  var _valid2 = _errs133 === errors;
                  valid19 = valid19 || _valid2;
                  if (!valid19) {
                    const _errs142 = errors;
                    if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                      if (data36.kind === void 0) {
                        const err136 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err136];
                        } else {
                          vErrors.push(err136);
                        }
                        errors++;
                      }
                      if (data36.executionUnitId === void 0) {
                        const err137 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
                        if (vErrors === null) {
                          vErrors = [err137];
                        } else {
                          vErrors.push(err137);
                        }
                        errors++;
                      }
                      if (data36.blockIndex === void 0) {
                        const err138 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/required", keyword: "required", params: { missingProperty: "blockIndex" }, message: "must have required property 'blockIndex'" };
                        if (vErrors === null) {
                          vErrors = [err138];
                        } else {
                          vErrors.push(err138);
                        }
                        errors++;
                      }
                      for (const key17 in data36) {
                        if (!(key17 === "kind" || key17 === "executionUnitId" || key17 === "blockIndex")) {
                          const err139 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key17 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err139];
                          } else {
                            vErrors.push(err139);
                          }
                          errors++;
                        }
                      }
                      if (data36.kind !== void 0) {
                        let data46 = data36.kind;
                        if (typeof data46 !== "string") {
                          const err140 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err140];
                          } else {
                            vErrors.push(err140);
                          }
                          errors++;
                        }
                        if ("stage_output" !== data46) {
                          const err141 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "stage_output" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err141];
                          } else {
                            vErrors.push(err141);
                          }
                          errors++;
                        }
                      }
                      if (data36.executionUnitId !== void 0) {
                        if (typeof data36.executionUnitId !== "string") {
                          const err142 = { instancePath: instancePath + "/source/executionUnitId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err142];
                          } else {
                            vErrors.push(err142);
                          }
                          errors++;
                        }
                      }
                      if (data36.blockIndex !== void 0) {
                        let data48 = data36.blockIndex;
                        if (!(typeof data48 == "number" && isFinite(data48))) {
                          const err143 = { instancePath: instancePath + "/source/blockIndex", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/properties/blockIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                          if (vErrors === null) {
                            vErrors = [err143];
                          } else {
                            vErrors.push(err143);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err144 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err144];
                      } else {
                        vErrors.push(err144);
                      }
                      errors++;
                    }
                    var _valid2 = _errs142 === errors;
                    valid19 = valid19 || _valid2;
                    if (!valid19) {
                      const _errs151 = errors;
                      if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                        if (data36.kind === void 0) {
                          const err145 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err145];
                          } else {
                            vErrors.push(err145);
                          }
                          errors++;
                        }
                        if (data36.candidateId === void 0) {
                          const err146 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/required", keyword: "required", params: { missingProperty: "candidateId" }, message: "must have required property 'candidateId'" };
                          if (vErrors === null) {
                            vErrors = [err146];
                          } else {
                            vErrors.push(err146);
                          }
                          errors++;
                        }
                        for (const key18 in data36) {
                          if (!(key18 === "kind" || key18 === "candidateId")) {
                            const err147 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key18 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err147];
                            } else {
                              vErrors.push(err147);
                            }
                            errors++;
                          }
                        }
                        if (data36.kind !== void 0) {
                          let data49 = data36.kind;
                          if (typeof data49 !== "string") {
                            const err148 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err148];
                            } else {
                              vErrors.push(err148);
                            }
                            errors++;
                          }
                          if ("completion_candidate" !== data49) {
                            const err149 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "completion_candidate" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err149];
                            } else {
                              vErrors.push(err149);
                            }
                            errors++;
                          }
                        }
                        if (data36.candidateId !== void 0) {
                          if (typeof data36.candidateId !== "string") {
                            const err150 = { instancePath: instancePath + "/source/candidateId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/properties/candidateId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err150];
                            } else {
                              vErrors.push(err150);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err151 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err151];
                        } else {
                          vErrors.push(err151);
                        }
                        errors++;
                      }
                      var _valid2 = _errs151 === errors;
                      valid19 = valid19 || _valid2;
                      if (!valid19) {
                        const _errs158 = errors;
                        if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                          if (data36.kind === void 0) {
                            const err152 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                            if (vErrors === null) {
                              vErrors = [err152];
                            } else {
                              vErrors.push(err152);
                            }
                            errors++;
                          }
                          if (data36.actionId === void 0) {
                            const err153 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                            if (vErrors === null) {
                              vErrors = [err153];
                            } else {
                              vErrors.push(err153);
                            }
                            errors++;
                          }
                          for (const key19 in data36) {
                            if (!(key19 === "kind" || key19 === "actionId")) {
                              const err154 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key19 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err154];
                              } else {
                                vErrors.push(err154);
                              }
                              errors++;
                            }
                          }
                          if (data36.kind !== void 0) {
                            let data51 = data36.kind;
                            if (typeof data51 !== "string") {
                              const err155 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err155];
                              } else {
                                vErrors.push(err155);
                              }
                              errors++;
                            }
                            if ("host_execution" !== data51) {
                              const err156 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "host_execution" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err156];
                              } else {
                                vErrors.push(err156);
                              }
                              errors++;
                            }
                          }
                          if (data36.actionId !== void 0) {
                            if (typeof data36.actionId !== "string") {
                              const err157 = { instancePath: instancePath + "/source/actionId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err157];
                              } else {
                                vErrors.push(err157);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err158 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err158];
                          } else {
                            vErrors.push(err158);
                          }
                          errors++;
                        }
                        var _valid2 = _errs158 === errors;
                        valid19 = valid19 || _valid2;
                        if (!valid19) {
                          const _errs165 = errors;
                          if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                            if (data36.kind === void 0) {
                              const err159 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                              if (vErrors === null) {
                                vErrors = [err159];
                              } else {
                                vErrors.push(err159);
                              }
                              errors++;
                            }
                            if (data36.noticeId === void 0) {
                              const err160 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/required", keyword: "required", params: { missingProperty: "noticeId" }, message: "must have required property 'noticeId'" };
                              if (vErrors === null) {
                                vErrors = [err160];
                              } else {
                                vErrors.push(err160);
                              }
                              errors++;
                            }
                            for (const key20 in data36) {
                              if (!(key20 === "kind" || key20 === "noticeId")) {
                                const err161 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key20 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err161];
                                } else {
                                  vErrors.push(err161);
                                }
                                errors++;
                              }
                            }
                            if (data36.kind !== void 0) {
                              let data53 = data36.kind;
                              if (typeof data53 !== "string") {
                                const err162 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err162];
                                } else {
                                  vErrors.push(err162);
                                }
                                errors++;
                              }
                              if ("runtime_notice" !== data53) {
                                const err163 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "runtime_notice" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err163];
                                } else {
                                  vErrors.push(err163);
                                }
                                errors++;
                              }
                            }
                            if (data36.noticeId !== void 0) {
                              if (typeof data36.noticeId !== "string") {
                                const err164 = { instancePath: instancePath + "/source/noticeId", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/properties/noticeId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err164];
                                } else {
                                  vErrors.push(err164);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err165 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err165];
                            } else {
                              vErrors.push(err165);
                            }
                            errors++;
                          }
                          var _valid2 = _errs165 === errors;
                          valid19 = valid19 || _valid2;
                        }
                      }
                    }
                  }
                }
              }
            }
            if (!valid19) {
              const err166 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GoalSnapshotMessageSourceV1/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
              if (vErrors === null) {
                vErrors = [err166];
              } else {
                vErrors.push(err166);
              }
              errors++;
            } else {
              errors = _errs111;
              if (vErrors !== null) {
                if (_errs111) {
                  vErrors.length = _errs111;
                } else {
                  vErrors = null;
                }
              }
            }
          }
        } else {
          const err167 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err167];
          } else {
            vErrors.push(err167);
          }
          errors++;
        }
        var _valid0 = _errs83 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err168 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err168];
        } else {
          vErrors.push(err168);
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
      validate17.errors = vErrors;
      return errors === 0;
    }
    var schema26 = { "type": "object", "properties": { "id": { "type": "string" }, "mode": { "type": "string", "enum": ["normal", "plan"] }, "approvedTask": { "$ref": "#/definitions/GoalSnapshotTaskV1" }, "status": { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"] }, "stepCount": { "type": "number" }, "exposedToolIds": { "type": "array", "items": { "type": "string" }, "description": "\u5F53\u524D Run \u5DF2\u5411\u6A21\u578B\u66B4\u9732\u5B8C\u6574 Schema \u7684\u5DE5\u5177 ID\u3002" }, "committedThroughSequence": { "type": "number", "description": "Trajectory \u53EF\u89C1\u9AD8\u6C34\u4F4D\uFF1B\u5305\u542B\u5DF2\u63D0\u4EA4\u7684\u6A21\u578B\u4E0A\u4E0B\u6587 frame\u3002" }, "memoryRevision": { "$ref": "#/definitions/GoalSnapshotMemoryRevisionV1" }, "currentStage": { "$ref": "#/definitions/GoalSnapshotRunStageV1", "description": "Snapshot \u4E2D\u5F53\u524D\u6D3B\u52A8\u6216\u6700\u65B0\u5DF2\u63A5\u53D7\u7684 Run \u5185\u90E8\u9636\u6BB5\u3002" }, "planRoute": { "$ref": "#/definitions/GoalSnapshotPlanRouteV1", "description": "\u5DF2\u6279\u51C6 Plan Run \u7684\u5B8C\u6574\u8DEF\u7EBF\uFF1B\u666E\u901A Run \u548C\u5F85\u5BA1\u6279 Run \u7701\u7565\u3002" }, "lastStep": { "$ref": "#/definitions/GoalSnapshotStepRecordV1" }, "pendingAction": { "$ref": "#/definitions/GoalSnapshotPendingActionV1" }, "pendingActionBatch": { "$ref": "#/definitions/GoalSnapshotPendingActionBatchV1", "description": "\u591A\u8C03\u7528\u6279\u6B21\u4E2D\u5C1A\u672A\u6682\u5B58\u7684\u540E\u7EED\u51B3\u7B56\uFF1B\u4E0E `pendingAction` \u5171\u540C\u6784\u6210\u6062\u590D\u70B9\u3002" }, "pendingProgram": { "$ref": "#/definitions/GoalSnapshotPendingProgramV1" }, "pendingInteraction": { "$ref": "#/definitions/GoalSnapshotPendingInteractionV1" }, "pendingThink": { "$ref": "#/definitions/GoalSnapshotPendingThinkV1" }, "pendingModelRepair": { "$ref": "#/definitions/GoalSnapshotPendingModelRepairV1" }, "steerInputs": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotSteerInputV1" } }, "interruption": { "$ref": "#/definitions/GoalSnapshotRunInterruptionV1" }, "stopReason": { "$ref": "#/definitions/GoalSnapshotStopReasonV1" }, "contextEpoch": { "$ref": "#/definitions/GoalSnapshotContextEpochV1" } }, "required": ["id", "mode", "status", "stepCount", "exposedToolIds", "committedThroughSequence", "contextEpoch"], "additionalProperties": false, "description": "Snapshot \u4E2D\u7684 Run \u72B6\u6001\u3002" };
    var schema59 = { "type": "object", "properties": { "goalId": { "type": "string" }, "runId": { "type": "string" }, "stepOrdinal": { "type": "number" }, "executionUnitId": { "type": "string" }, "stage": { "type": "string", "enum": ["decide", "think"] }, "inputBoundary": { "type": "string" }, "attemptsStarted": { "type": "number" }, "continuationsStarted": { "type": "number", "description": "\u4E0D\u63A8\u8FDB\u7C7B\u8C03\u7528\u6570\uFF1B\u4E0E `attemptsStarted` \u72EC\u7ACB\u8BA1\u6570\u3002" }, "latestFailureClass": { "type": "string", "enum": ["non_advancing", "protocol"], "description": "\u6700\u8FD1\u4E00\u6B21\u5931\u8D25\u7684\u7C7B\u522B\uFF1B\u51B3\u5B9A\u4E0B\u4E00\u6B21\u8C03\u7528\u8BA1\u5165\u54EA\u4E2A\u9884\u7B97\u3002" }, "latestAttemptEventId": { "type": "string" }, "latestFeedbackEventId": { "type": "string" }, "thinkRequestId": { "type": "string" } }, "required": ["goalId", "runId", "stepOrdinal", "executionUnitId", "stage", "inputBoundary", "attemptsStarted", "latestAttemptEventId"], "additionalProperties": false, "description": "Snapshot \u4E2D\u53EF\u6062\u590D\u7684\u6A21\u578B\u8F93\u51FA\u4FEE\u590D\u5C1D\u8BD5\u6307\u9488\u3002" };
    var schema62 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "max_steps_exceeded" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "execution_error" }, "code": { "type": "string", "enum": ["TOOL_NOT_AUTHORIZED", "TOOL_NOT_FOUND", "INVALID_TOOL_INPUT", "INVALID_MEMORY_PATCH", "INVALID_AGENT_DECISION", "COMPLETION_REVIEW_INPUT_TOO_LARGE", "MODEL_REQUEST_FAILED", "TOOL_EXECUTION_ERROR"] }, "message": { "type": "string" } }, "required": ["kind", "code", "message"], "additionalProperties": false }], "description": "Snapshot \u4E2D\u975E Step \u81EA\u8EAB\u5BFC\u81F4\u7684 Run \u7EC8\u6B62\u539F\u56E0\u3002" };
    var schema29 = { "type": "object", "properties": { "expectToolId": { "type": "string" }, "expectOutcome": { "type": "string", "enum": ["success", "failure"] } }, "required": ["expectToolId", "expectOutcome"], "additionalProperties": false, "description": "Snapshot \u4E2D\u5355\u6761\u5B8C\u6210\u6761\u4EF6\u7684\u9A8C\u6536\u58F0\u660E\u3002" };
    function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.text === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "text" || key0 === "acceptance")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.text !== void 0) {
          if (typeof data.text !== "string") {
            const err2 = { instancePath: instancePath + "/text", schemaPath: "#/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.acceptance !== void 0) {
          let data1 = data.acceptance;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.expectToolId === void 0) {
              const err3 = { instancePath: instancePath + "/acceptance", schemaPath: "#/definitions/GoalSnapshotCompletionAcceptanceV1/required", keyword: "required", params: { missingProperty: "expectToolId" }, message: "must have required property 'expectToolId'" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            if (data1.expectOutcome === void 0) {
              const err4 = { instancePath: instancePath + "/acceptance", schemaPath: "#/definitions/GoalSnapshotCompletionAcceptanceV1/required", keyword: "required", params: { missingProperty: "expectOutcome" }, message: "must have required property 'expectOutcome'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "expectToolId" || key1 === "expectOutcome")) {
                const err5 = { instancePath: instancePath + "/acceptance", schemaPath: "#/definitions/GoalSnapshotCompletionAcceptanceV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err5];
                } else {
                  vErrors.push(err5);
                }
                errors++;
              }
            }
            if (data1.expectToolId !== void 0) {
              if (typeof data1.expectToolId !== "string") {
                const err6 = { instancePath: instancePath + "/acceptance/expectToolId", schemaPath: "#/definitions/GoalSnapshotCompletionAcceptanceV1/properties/expectToolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
            }
            if (data1.expectOutcome !== void 0) {
              let data3 = data1.expectOutcome;
              if (typeof data3 !== "string") {
                const err7 = { instancePath: instancePath + "/acceptance/expectOutcome", schemaPath: "#/definitions/GoalSnapshotCompletionAcceptanceV1/properties/expectOutcome/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
              if (!(data3 === "success" || data3 === "failure")) {
                const err8 = { instancePath: instancePath + "/acceptance/expectOutcome", schemaPath: "#/definitions/GoalSnapshotCompletionAcceptanceV1/properties/expectOutcome/enum", keyword: "enum", params: { allowedValues: schema29.properties.expectOutcome.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
          } else {
            const err9 = { instancePath: instancePath + "/acceptance", schemaPath: "#/definitions/GoalSnapshotCompletionAcceptanceV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
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
      validate21.errors = vErrors;
      return errors === 0;
    }
    function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.objective === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "objective" }, message: "must have required property 'objective'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.completionCriteria === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "completionCriteria" }, message: "must have required property 'completionCriteria'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "objective" || key0 === "completionCriteria")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.objective !== void 0) {
          if (typeof data.objective !== "string") {
            const err3 = { instancePath: instancePath + "/objective", schemaPath: "#/properties/objective/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.completionCriteria !== void 0) {
          let data1 = data.completionCriteria;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate21(data1[i0], { instancePath: instancePath + "/completionCriteria/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err4 = { instancePath: instancePath + "/completionCriteria", schemaPath: "#/properties/completionCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
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
      validate20.errors = vErrors;
      return errors === 0;
    }
    var schema31 = { "type": "object", "properties": { "stageId": { "type": "string" }, "revision": { "type": "number" }, "status": { "type": "string", "enum": ["executing", "accepted"] }, "target": { "type": "string" }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }, "previousStageResultRef": { "$ref": "#/definitions/GoalSnapshotPreviousStageResultRefV1" }, "latestReviewRejection": { "$ref": "#/definitions/GoalSnapshotStageRejectionV1" }, "acceptedSequence": { "type": "number" } }, "required": ["stageId", "revision", "status", "target", "acceptanceCriteria"], "additionalProperties": false, "description": "Snapshot \u4E2D\u5F53\u524D\u6D3B\u52A8\u9636\u6BB5\u7684\u72B6\u6001\u3002" };
    function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.stageId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.revision === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.target === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.acceptanceCriteria === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "stageId" || key0 === "revision" || key0 === "status" || key0 === "target" || key0 === "acceptanceCriteria" || key0 === "previousStageResultRef" || key0 === "latestReviewRejection" || key0 === "acceptedSequence")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.stageId !== void 0) {
          if (typeof data.stageId !== "string") {
            const err6 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data1 = data.revision;
          if (!(typeof data1 == "number" && isFinite(data1))) {
            const err7 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data2 = data.status;
          if (typeof data2 !== "string") {
            const err8 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data2 === "executing" || data2 === "accepted")) {
            const err9 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema31.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.target !== void 0) {
          if (typeof data.target !== "string") {
            const err10 = { instancePath: instancePath + "/target", schemaPath: "#/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.acceptanceCriteria !== void 0) {
          let data4 = data.acceptanceCriteria;
          if (Array.isArray(data4)) {
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data4[i0] !== "string") {
                const err11 = { instancePath: instancePath + "/acceptanceCriteria/" + i0, schemaPath: "#/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
          } else {
            const err12 = { instancePath: instancePath + "/acceptanceCriteria", schemaPath: "#/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.previousStageResultRef !== void 0) {
          let data6 = data.previousStageResultRef;
          if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
            if (data6.stageId === void 0) {
              const err13 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/GoalSnapshotPreviousStageResultRefV1/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data6.sequence === void 0) {
              const err14 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/GoalSnapshotPreviousStageResultRefV1/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            for (const key1 in data6) {
              if (!(key1 === "stageId" || key1 === "sequence")) {
                const err15 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/GoalSnapshotPreviousStageResultRefV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data6.stageId !== void 0) {
              if (typeof data6.stageId !== "string") {
                const err16 = { instancePath: instancePath + "/previousStageResultRef/stageId", schemaPath: "#/definitions/GoalSnapshotPreviousStageResultRefV1/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data6.sequence !== void 0) {
              let data8 = data6.sequence;
              if (!(typeof data8 == "number" && isFinite(data8))) {
                const err17 = { instancePath: instancePath + "/previousStageResultRef/sequence", schemaPath: "#/definitions/GoalSnapshotPreviousStageResultRefV1/properties/sequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/previousStageResultRef", schemaPath: "#/definitions/GoalSnapshotPreviousStageResultRefV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.latestReviewRejection !== void 0) {
          let data9 = data.latestReviewRejection;
          if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
            if (data9.feedback === void 0) {
              const err19 = { instancePath: instancePath + "/latestReviewRejection", schemaPath: "#/definitions/GoalSnapshotStageRejectionV1/required", keyword: "required", params: { missingProperty: "feedback" }, message: "must have required property 'feedback'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            for (const key2 in data9) {
              if (!(key2 === "feedback" || key2 === "rejectedAtSequence")) {
                const err20 = { instancePath: instancePath + "/latestReviewRejection", schemaPath: "#/definitions/GoalSnapshotStageRejectionV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data9.feedback !== void 0) {
              if (typeof data9.feedback !== "string") {
                const err21 = { instancePath: instancePath + "/latestReviewRejection/feedback", schemaPath: "#/definitions/GoalSnapshotStageRejectionV1/properties/feedback/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data9.rejectedAtSequence !== void 0) {
              let data11 = data9.rejectedAtSequence;
              if (!(typeof data11 == "number" && isFinite(data11))) {
                const err22 = { instancePath: instancePath + "/latestReviewRejection/rejectedAtSequence", schemaPath: "#/definitions/GoalSnapshotStageRejectionV1/properties/rejectedAtSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
          } else {
            const err23 = { instancePath: instancePath + "/latestReviewRejection", schemaPath: "#/definitions/GoalSnapshotStageRejectionV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.acceptedSequence !== void 0) {
          let data12 = data.acceptedSequence;
          if (!(typeof data12 == "number" && isFinite(data12))) {
            const err24 = { instancePath: instancePath + "/acceptedSequence", schemaPath: "#/properties/acceptedSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
      } else {
        const err25 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      validate24.errors = vErrors;
      return errors === 0;
    }
    var schema35 = { "type": "object", "properties": { "stageId": { "type": "string" }, "revision": { "type": "number" }, "status": { "type": "string", "enum": ["pending", "executing", "accepted"] }, "target": { "type": "string" }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }, "acceptedSequence": { "type": "number" } }, "required": ["stageId", "revision", "status", "target", "acceptanceCriteria"], "additionalProperties": false, "description": "Snapshot \u4E2D\u5355\u4E2A Plan Run \u8DEF\u7EBF\u9636\u6BB5\u3002" };
    function validate26(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.nextStageIndex === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextStageIndex" }, message: "must have required property 'nextStageIndex'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.nextStageOrdinal === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextStageOrdinal" }, message: "must have required property 'nextStageOrdinal'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.stages === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "revision" || key0 === "revisionReason" || key0 === "nextStageIndex" || key0 === "nextStageOrdinal" || key0 === "stages")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data0 = data.revision;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err5 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.revisionReason !== void 0) {
          if (typeof data.revisionReason !== "string") {
            const err6 = { instancePath: instancePath + "/revisionReason", schemaPath: "#/properties/revisionReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.nextStageIndex !== void 0) {
          let data2 = data.nextStageIndex;
          if (!(typeof data2 == "number" && isFinite(data2))) {
            const err7 = { instancePath: instancePath + "/nextStageIndex", schemaPath: "#/properties/nextStageIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.nextStageOrdinal !== void 0) {
          let data3 = data.nextStageOrdinal;
          if (!(typeof data3 == "number" && isFinite(data3))) {
            const err8 = { instancePath: instancePath + "/nextStageOrdinal", schemaPath: "#/properties/nextStageOrdinal/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.stages !== void 0) {
          let data4 = data.stages;
          if (Array.isArray(data4)) {
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data5 = data4[i0];
              if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                if (data5.stageId === void 0) {
                  const err9 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                if (data5.revision === void 0) {
                  const err10 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
                if (data5.status === void 0) {
                  const err11 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                if (data5.target === void 0) {
                  const err12 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                if (data5.acceptanceCriteria === void 0) {
                  const err13 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                for (const key1 in data5) {
                  if (!(key1 === "stageId" || key1 === "revision" || key1 === "status" || key1 === "target" || key1 === "acceptanceCriteria" || key1 === "acceptedSequence")) {
                    const err14 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                }
                if (data5.stageId !== void 0) {
                  if (typeof data5.stageId !== "string") {
                    const err15 = { instancePath: instancePath + "/stages/" + i0 + "/stageId", schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data5.revision !== void 0) {
                  let data7 = data5.revision;
                  if (!(typeof data7 == "number" && isFinite(data7))) {
                    const err16 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
                if (data5.status !== void 0) {
                  let data8 = data5.status;
                  if (typeof data8 !== "string") {
                    const err17 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                  if (!(data8 === "pending" || data8 === "executing" || data8 === "accepted")) {
                    const err18 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/status/enum", keyword: "enum", params: { allowedValues: schema35.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                }
                if (data5.target !== void 0) {
                  if (typeof data5.target !== "string") {
                    const err19 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data5.acceptanceCriteria !== void 0) {
                  let data10 = data5.acceptanceCriteria;
                  if (Array.isArray(data10)) {
                    const len1 = data10.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data10[i1] !== "string") {
                        const err20 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria/" + i1, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err20];
                        } else {
                          vErrors.push(err20);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err21 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria", schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                }
                if (data5.acceptedSequence !== void 0) {
                  let data12 = data5.acceptedSequence;
                  if (!(typeof data12 == "number" && isFinite(data12))) {
                    const err22 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/properties/acceptedSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                }
              } else {
                const err23 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteStageV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
          } else {
            const err24 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
      } else {
        const err25 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      validate26.errors = vErrors;
      return errors === 0;
    }
    var wrapper0 = { validate: validate30 };
    function validate30(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
      validate30.errors = vErrors;
      return errors === 0;
    }
    function validate29(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.actionId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.toolId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.input === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "actionId" || key0 === "toolId" || key0 === "input")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          if (typeof data.actionId !== "string") {
            const err4 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          if (typeof data.toolId !== "string") {
            const err5 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.input !== void 0) {
          if (!validate30(data.input, { instancePath: instancePath + "/input", parentData: data, parentDataProperty: "input", rootData })) {
            vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
            errors = vErrors.length;
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
      validate29.errors = vErrors;
      return errors === 0;
    }
    function validate33(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.output === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "output" }, message: "must have required property 'output'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.summary === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "output" || key0 === "summary")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if ("success" !== data0) {
            const err5 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "success" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.output !== void 0) {
          if (!validate30(data.output, { instancePath: instancePath + "/output", parentData: data, parentDataProperty: "output", rootData })) {
            vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
            errors = vErrors.length;
          }
        }
        if (data.summary !== void 0) {
          if (typeof data.summary !== "string") {
            const err6 = { instancePath: instancePath + "/summary", schemaPath: "#/anyOf/0/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs9 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err8 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (data.code === void 0) {
            const err9 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (data.message === void 0) {
            const err10 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (data.retryable === void 0) {
            const err11 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "retryable" }, message: "must have required property 'retryable'" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "code" || key1 === "message" || key1 === "retryable" || key1 === "details")) {
              const err12 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data3 = data.kind;
            if (typeof data3 !== "string") {
              const err13 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if ("failure" !== data3) {
              const err14 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "failure" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data.code !== void 0) {
            if (typeof data.code !== "string") {
              const err15 = { instancePath: instancePath + "/code", schemaPath: "#/anyOf/1/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
          if (data.message !== void 0) {
            if (typeof data.message !== "string") {
              const err16 = { instancePath: instancePath + "/message", schemaPath: "#/anyOf/1/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.retryable !== void 0) {
            if (typeof data.retryable !== "boolean") {
              const err17 = { instancePath: instancePath + "/retryable", schemaPath: "#/anyOf/1/properties/retryable/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          if (data.details !== void 0) {
            if (!validate30(data.details, { instancePath: instancePath + "/details", parentData: data, parentDataProperty: "details", rootData })) {
              vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err18 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        var _valid0 = _errs9 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs21 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err19 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data.reason === void 0) {
              const err20 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "kind" || key2 === "reason")) {
                const err21 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data8 = data.kind;
              if (typeof data8 !== "string") {
                const err22 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              if ("rejected" !== data8) {
                const err23 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "rejected" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data.reason !== void 0) {
              if (typeof data.reason !== "string") {
                const err24 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/2/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
          } else {
            const err25 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
          var _valid0 = _errs21 === errors;
          valid0 = valid0 || _valid0;
        }
      }
      if (!valid0) {
        const err26 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
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
      validate33.errors = vErrors;
      return errors === 0;
    }
    var schema40 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "complete" }, "summary": { "type": "string" }, "evidenceSequences": { "type": "array", "items": { "type": "number" } }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "summary", "evidenceSequences"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "complete" }, "summary": { "type": "string" }, "completionEvidence": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotCompletionEvidenceV1" } }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "summary", "completionEvidence"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "wait" }, "reason": { "type": "string" }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "reason"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "fail" }, "error": { "type": "string" }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "error"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "context_lookup" }, "operation": { "type": "string", "enum": ["history_search", "directory_browse", "directory_search", "source_expand"] }, "need": { "type": "string", "enum": ["conversation_history", "historical_execution", "decision_rationale"] }, "question": { "type": "string" }, "filters": { "$ref": "#/definitions/GoalSnapshotContextLookupFiltersV1" }, "query": { "type": "string" }, "cursor": { "type": "string" }, "limit": { "type": "number" }, "category": { "type": "string" }, "sourceRef": { "type": "string" }, "offset": { "type": "number" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_discovery" }, "query": { "type": "string" } }, "required": ["kind", "query"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "goal_plan_update" }, "baseRevision": { "type": "number" }, "operations": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotGoalPlanPatchOperationV1" } }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "baseRevision", "operations"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "run_stage_update" }, "stageId": { "type": "string" }, "baseRevision": { "type": "number" }, "reason": { "type": "string" }, "target": { "type": "string" }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "target", "acceptanceCriteria"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "run_stage_complete" }, "stageId": { "type": "string" }, "summary": { "type": "string" }, "evidenceSequences": { "type": "array", "items": { "type": "number" } }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "stageId", "summary"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "run_plan_route_update" }, "baseRevision": { "type": "number" }, "reason": { "type": "string" }, "route": { "$ref": "#/definitions/GoalSnapshotPlanRouteCandidateV1" }, "approvalRequest": { "type": "string" }, "memoryPatch": { "$ref": "#/definitions/GoalSnapshotMemoryPatchV1" } }, "required": ["kind", "baseRevision", "reason", "route"], "additionalProperties": false }], "description": "Snapshot \u4E2D\u7684\u7ED3\u6784\u5316 Agent Decision \u7ED3\u679C\u3002" };
    var schema45 = { "anyOf": [{ "type": "object", "properties": { "type": { "type": "string", "const": "add" }, "content": { "type": "string" }, "position": { "type": "number" } }, "required": ["type", "content"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "update" }, "id": { "type": "string" }, "content": { "type": "string" }, "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] }, "evidenceSequences": { "type": "array", "items": { "type": "number" } } }, "required": ["type", "id"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "reorder" }, "id": { "type": "string" }, "position": { "type": "number" } }, "required": ["type", "id", "position"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "cancel" }, "id": { "type": "string" } }, "required": ["type", "id"], "additionalProperties": false }], "description": "Snapshot \u4E2D\u53EF\u56DE\u653E\u7684 GoalPlan \u589E\u91CF\u64CD\u4F5C\u3002" };
    var schema42 = { "anyOf": [{ "type": "object", "properties": { "type": { "type": "string", "const": "upsert_fact" }, "fact": { "type": "object", "properties": { "subject": { "type": "string" }, "predicate": { "type": "string" }, "value": { "$ref": "#/definitions/SnapshotJsonValue" }, "stability": { "type": "string", "enum": ["stable", "last_observed"] }, "evidenceSequences": { "type": "array", "items": { "type": "number" } }, "scope": { "type": "string", "enum": ["goal", "phase"] } }, "required": ["subject", "predicate", "value", "stability", "evidenceSequences"], "additionalProperties": false } }, "required": ["type", "fact"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "retire_fact" }, "fact": { "type": "object", "properties": { "id": { "type": "string" }, "evidenceSequences": { "type": "array", "items": { "type": "number" } } }, "required": ["id", "evidenceSequences"], "additionalProperties": false } }, "required": ["type", "fact"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "create_hypothesis" }, "hypothesis": { "type": "object", "properties": { "statement": { "type": "string" }, "scope": { "type": "string", "enum": ["goal", "phase"] } }, "required": ["statement"], "additionalProperties": false } }, "required": ["type", "hypothesis"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "update_hypothesis" }, "hypothesis": { "type": "object", "properties": { "id": { "type": "string" }, "statement": { "type": "string" }, "status": { "type": "string", "enum": ["active", "resolved", "superseded"] } }, "required": ["id"], "additionalProperties": false } }, "required": ["type", "hypothesis"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "create_blocker" }, "blocker": { "type": "object", "properties": { "description": { "type": "string" }, "scope": { "type": "string", "enum": ["goal", "phase"] } }, "required": ["description"], "additionalProperties": false } }, "required": ["type", "blocker"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "update_blocker" }, "blocker": { "type": "object", "properties": { "id": { "type": "string" }, "description": { "type": "string" }, "status": { "type": "string", "enum": ["active", "resolved", "superseded"] } }, "required": ["id"], "additionalProperties": false } }, "required": ["type", "blocker"], "additionalProperties": false }], "description": "Snapshot \u4E2D\u7684\u4E00\u6761 Memory Patch \u64CD\u4F5C\u3002" };
    function validate39(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.fact === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "fact")) {
            const err2 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("upsert_fact" !== data0) {
            const err4 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/const", keyword: "const", params: { allowedValue: "upsert_fact" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.fact !== void 0) {
          let data1 = data.fact;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.subject === void 0) {
              const err5 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/0/properties/fact/required", keyword: "required", params: { missingProperty: "subject" }, message: "must have required property 'subject'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data1.predicate === void 0) {
              const err6 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/0/properties/fact/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data1.value === void 0) {
              const err7 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/0/properties/fact/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (data1.stability === void 0) {
              const err8 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/0/properties/fact/required", keyword: "required", params: { missingProperty: "stability" }, message: "must have required property 'stability'" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data1.evidenceSequences === void 0) {
              const err9 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/0/properties/fact/required", keyword: "required", params: { missingProperty: "evidenceSequences" }, message: "must have required property 'evidenceSequences'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "subject" || key1 === "predicate" || key1 === "value" || key1 === "stability" || key1 === "evidenceSequences" || key1 === "scope")) {
                const err10 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/0/properties/fact/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
            if (data1.subject !== void 0) {
              if (typeof data1.subject !== "string") {
                const err11 = { instancePath: instancePath + "/fact/subject", schemaPath: "#/anyOf/0/properties/fact/properties/subject/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data1.predicate !== void 0) {
              if (typeof data1.predicate !== "string") {
                const err12 = { instancePath: instancePath + "/fact/predicate", schemaPath: "#/anyOf/0/properties/fact/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data1.value !== void 0) {
              if (!validate30(data1.value, { instancePath: instancePath + "/fact/value", parentData: data1, parentDataProperty: "value", rootData })) {
                vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
                errors = vErrors.length;
              }
            }
            if (data1.stability !== void 0) {
              let data5 = data1.stability;
              if (typeof data5 !== "string") {
                const err13 = { instancePath: instancePath + "/fact/stability", schemaPath: "#/anyOf/0/properties/fact/properties/stability/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
              if (!(data5 === "stable" || data5 === "last_observed")) {
                const err14 = { instancePath: instancePath + "/fact/stability", schemaPath: "#/anyOf/0/properties/fact/properties/stability/enum", keyword: "enum", params: { allowedValues: schema42.anyOf[0].properties.fact.properties.stability.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data1.evidenceSequences !== void 0) {
              let data6 = data1.evidenceSequences;
              if (Array.isArray(data6)) {
                const len0 = data6.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  let data7 = data6[i0];
                  if (!(typeof data7 == "number" && isFinite(data7))) {
                    const err15 = { instancePath: instancePath + "/fact/evidenceSequences/" + i0, schemaPath: "#/anyOf/0/properties/fact/properties/evidenceSequences/items/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
              } else {
                const err16 = { instancePath: instancePath + "/fact/evidenceSequences", schemaPath: "#/anyOf/0/properties/fact/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data1.scope !== void 0) {
              let data8 = data1.scope;
              if (typeof data8 !== "string") {
                const err17 = { instancePath: instancePath + "/fact/scope", schemaPath: "#/anyOf/0/properties/fact/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
              if (!(data8 === "goal" || data8 === "phase")) {
                const err18 = { instancePath: instancePath + "/fact/scope", schemaPath: "#/anyOf/0/properties/fact/properties/scope/enum", keyword: "enum", params: { allowedValues: schema42.anyOf[0].properties.fact.properties.scope.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/0/properties/fact/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs22 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.type === void 0) {
            const err21 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (data.fact === void 0) {
            const err22 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          for (const key2 in data) {
            if (!(key2 === "type" || key2 === "fact")) {
              const err23 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
          if (data.type !== void 0) {
            let data9 = data.type;
            if (typeof data9 !== "string") {
              const err24 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if ("retire_fact" !== data9) {
              const err25 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "retire_fact" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          }
          if (data.fact !== void 0) {
            let data10 = data.fact;
            if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
              if (data10.id === void 0) {
                const err26 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/1/properties/fact/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              if (data10.evidenceSequences === void 0) {
                const err27 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/1/properties/fact/required", keyword: "required", params: { missingProperty: "evidenceSequences" }, message: "must have required property 'evidenceSequences'" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              for (const key3 in data10) {
                if (!(key3 === "id" || key3 === "evidenceSequences")) {
                  const err28 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/1/properties/fact/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
              }
              if (data10.id !== void 0) {
                if (typeof data10.id !== "string") {
                  const err29 = { instancePath: instancePath + "/fact/id", schemaPath: "#/anyOf/1/properties/fact/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              }
              if (data10.evidenceSequences !== void 0) {
                let data12 = data10.evidenceSequences;
                if (Array.isArray(data12)) {
                  const len1 = data12.length;
                  for (let i1 = 0; i1 < len1; i1++) {
                    let data13 = data12[i1];
                    if (!(typeof data13 == "number" && isFinite(data13))) {
                      const err30 = { instancePath: instancePath + "/fact/evidenceSequences/" + i1, schemaPath: "#/anyOf/1/properties/fact/properties/evidenceSequences/items/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                      if (vErrors === null) {
                        vErrors = [err30];
                      } else {
                        vErrors.push(err30);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err31 = { instancePath: instancePath + "/fact/evidenceSequences", schemaPath: "#/anyOf/1/properties/fact/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
              }
            } else {
              const err32 = { instancePath: instancePath + "/fact", schemaPath: "#/anyOf/1/properties/fact/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
        } else {
          const err33 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
        var _valid0 = _errs22 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs36 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.type === void 0) {
              const err34 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data.hypothesis === void 0) {
              const err35 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "hypothesis" }, message: "must have required property 'hypothesis'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            for (const key4 in data) {
              if (!(key4 === "type" || key4 === "hypothesis")) {
                const err36 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
            }
            if (data.type !== void 0) {
              let data14 = data.type;
              if (typeof data14 !== "string") {
                const err37 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
              if ("create_hypothesis" !== data14) {
                const err38 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/const", keyword: "const", params: { allowedValue: "create_hypothesis" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
            if (data.hypothesis !== void 0) {
              let data15 = data.hypothesis;
              if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
                if (data15.statement === void 0) {
                  const err39 = { instancePath: instancePath + "/hypothesis", schemaPath: "#/anyOf/2/properties/hypothesis/required", keyword: "required", params: { missingProperty: "statement" }, message: "must have required property 'statement'" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                for (const key5 in data15) {
                  if (!(key5 === "statement" || key5 === "scope")) {
                    const err40 = { instancePath: instancePath + "/hypothesis", schemaPath: "#/anyOf/2/properties/hypothesis/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                }
                if (data15.statement !== void 0) {
                  if (typeof data15.statement !== "string") {
                    const err41 = { instancePath: instancePath + "/hypothesis/statement", schemaPath: "#/anyOf/2/properties/hypothesis/properties/statement/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                }
                if (data15.scope !== void 0) {
                  let data17 = data15.scope;
                  if (typeof data17 !== "string") {
                    const err42 = { instancePath: instancePath + "/hypothesis/scope", schemaPath: "#/anyOf/2/properties/hypothesis/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err42];
                    } else {
                      vErrors.push(err42);
                    }
                    errors++;
                  }
                  if (!(data17 === "goal" || data17 === "phase")) {
                    const err43 = { instancePath: instancePath + "/hypothesis/scope", schemaPath: "#/anyOf/2/properties/hypothesis/properties/scope/enum", keyword: "enum", params: { allowedValues: schema42.anyOf[2].properties.hypothesis.properties.scope.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                }
              } else {
                const err44 = { instancePath: instancePath + "/hypothesis", schemaPath: "#/anyOf/2/properties/hypothesis/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
          } else {
            const err45 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
          var _valid0 = _errs36 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs48 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.type === void 0) {
                const err46 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
              if (data.hypothesis === void 0) {
                const err47 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "hypothesis" }, message: "must have required property 'hypothesis'" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
              for (const key6 in data) {
                if (!(key6 === "type" || key6 === "hypothesis")) {
                  const err48 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err48];
                  } else {
                    vErrors.push(err48);
                  }
                  errors++;
                }
              }
              if (data.type !== void 0) {
                let data18 = data.type;
                if (typeof data18 !== "string") {
                  const err49 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err49];
                  } else {
                    vErrors.push(err49);
                  }
                  errors++;
                }
                if ("update_hypothesis" !== data18) {
                  const err50 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/const", keyword: "const", params: { allowedValue: "update_hypothesis" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err50];
                  } else {
                    vErrors.push(err50);
                  }
                  errors++;
                }
              }
              if (data.hypothesis !== void 0) {
                let data19 = data.hypothesis;
                if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
                  if (data19.id === void 0) {
                    const err51 = { instancePath: instancePath + "/hypothesis", schemaPath: "#/anyOf/3/properties/hypothesis/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                    if (vErrors === null) {
                      vErrors = [err51];
                    } else {
                      vErrors.push(err51);
                    }
                    errors++;
                  }
                  for (const key7 in data19) {
                    if (!(key7 === "id" || key7 === "statement" || key7 === "status")) {
                      const err52 = { instancePath: instancePath + "/hypothesis", schemaPath: "#/anyOf/3/properties/hypothesis/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err52];
                      } else {
                        vErrors.push(err52);
                      }
                      errors++;
                    }
                  }
                  if (data19.id !== void 0) {
                    if (typeof data19.id !== "string") {
                      const err53 = { instancePath: instancePath + "/hypothesis/id", schemaPath: "#/anyOf/3/properties/hypothesis/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err53];
                      } else {
                        vErrors.push(err53);
                      }
                      errors++;
                    }
                  }
                  if (data19.statement !== void 0) {
                    if (typeof data19.statement !== "string") {
                      const err54 = { instancePath: instancePath + "/hypothesis/statement", schemaPath: "#/anyOf/3/properties/hypothesis/properties/statement/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err54];
                      } else {
                        vErrors.push(err54);
                      }
                      errors++;
                    }
                  }
                  if (data19.status !== void 0) {
                    let data22 = data19.status;
                    if (typeof data22 !== "string") {
                      const err55 = { instancePath: instancePath + "/hypothesis/status", schemaPath: "#/anyOf/3/properties/hypothesis/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err55];
                      } else {
                        vErrors.push(err55);
                      }
                      errors++;
                    }
                    if (!(data22 === "active" || data22 === "resolved" || data22 === "superseded")) {
                      const err56 = { instancePath: instancePath + "/hypothesis/status", schemaPath: "#/anyOf/3/properties/hypothesis/properties/status/enum", keyword: "enum", params: { allowedValues: schema42.anyOf[3].properties.hypothesis.properties.status.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err56];
                      } else {
                        vErrors.push(err56);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err57 = { instancePath: instancePath + "/hypothesis", schemaPath: "#/anyOf/3/properties/hypothesis/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err57];
                  } else {
                    vErrors.push(err57);
                  }
                  errors++;
                }
              }
            } else {
              const err58 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err58];
              } else {
                vErrors.push(err58);
              }
              errors++;
            }
            var _valid0 = _errs48 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs62 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.type === void 0) {
                  const err59 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                  if (vErrors === null) {
                    vErrors = [err59];
                  } else {
                    vErrors.push(err59);
                  }
                  errors++;
                }
                if (data.blocker === void 0) {
                  const err60 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "blocker" }, message: "must have required property 'blocker'" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
                for (const key8 in data) {
                  if (!(key8 === "type" || key8 === "blocker")) {
                    const err61 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err61];
                    } else {
                      vErrors.push(err61);
                    }
                    errors++;
                  }
                }
                if (data.type !== void 0) {
                  let data23 = data.type;
                  if (typeof data23 !== "string") {
                    const err62 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err62];
                    } else {
                      vErrors.push(err62);
                    }
                    errors++;
                  }
                  if ("create_blocker" !== data23) {
                    const err63 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/const", keyword: "const", params: { allowedValue: "create_blocker" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err63];
                    } else {
                      vErrors.push(err63);
                    }
                    errors++;
                  }
                }
                if (data.blocker !== void 0) {
                  let data24 = data.blocker;
                  if (data24 && typeof data24 == "object" && !Array.isArray(data24)) {
                    if (data24.description === void 0) {
                      const err64 = { instancePath: instancePath + "/blocker", schemaPath: "#/anyOf/4/properties/blocker/required", keyword: "required", params: { missingProperty: "description" }, message: "must have required property 'description'" };
                      if (vErrors === null) {
                        vErrors = [err64];
                      } else {
                        vErrors.push(err64);
                      }
                      errors++;
                    }
                    for (const key9 in data24) {
                      if (!(key9 === "description" || key9 === "scope")) {
                        const err65 = { instancePath: instancePath + "/blocker", schemaPath: "#/anyOf/4/properties/blocker/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err65];
                        } else {
                          vErrors.push(err65);
                        }
                        errors++;
                      }
                    }
                    if (data24.description !== void 0) {
                      if (typeof data24.description !== "string") {
                        const err66 = { instancePath: instancePath + "/blocker/description", schemaPath: "#/anyOf/4/properties/blocker/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err66];
                        } else {
                          vErrors.push(err66);
                        }
                        errors++;
                      }
                    }
                    if (data24.scope !== void 0) {
                      let data26 = data24.scope;
                      if (typeof data26 !== "string") {
                        const err67 = { instancePath: instancePath + "/blocker/scope", schemaPath: "#/anyOf/4/properties/blocker/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err67];
                        } else {
                          vErrors.push(err67);
                        }
                        errors++;
                      }
                      if (!(data26 === "goal" || data26 === "phase")) {
                        const err68 = { instancePath: instancePath + "/blocker/scope", schemaPath: "#/anyOf/4/properties/blocker/properties/scope/enum", keyword: "enum", params: { allowedValues: schema42.anyOf[4].properties.blocker.properties.scope.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err68];
                        } else {
                          vErrors.push(err68);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err69 = { instancePath: instancePath + "/blocker", schemaPath: "#/anyOf/4/properties/blocker/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err69];
                    } else {
                      vErrors.push(err69);
                    }
                    errors++;
                  }
                }
              } else {
                const err70 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err70];
                } else {
                  vErrors.push(err70);
                }
                errors++;
              }
              var _valid0 = _errs62 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs74 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.type === void 0) {
                    const err71 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                  if (data.blocker === void 0) {
                    const err72 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "blocker" }, message: "must have required property 'blocker'" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                  for (const key10 in data) {
                    if (!(key10 === "type" || key10 === "blocker")) {
                      const err73 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err73];
                      } else {
                        vErrors.push(err73);
                      }
                      errors++;
                    }
                  }
                  if (data.type !== void 0) {
                    let data27 = data.type;
                    if (typeof data27 !== "string") {
                      const err74 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err74];
                      } else {
                        vErrors.push(err74);
                      }
                      errors++;
                    }
                    if ("update_blocker" !== data27) {
                      const err75 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/const", keyword: "const", params: { allowedValue: "update_blocker" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err75];
                      } else {
                        vErrors.push(err75);
                      }
                      errors++;
                    }
                  }
                  if (data.blocker !== void 0) {
                    let data28 = data.blocker;
                    if (data28 && typeof data28 == "object" && !Array.isArray(data28)) {
                      if (data28.id === void 0) {
                        const err76 = { instancePath: instancePath + "/blocker", schemaPath: "#/anyOf/5/properties/blocker/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                        if (vErrors === null) {
                          vErrors = [err76];
                        } else {
                          vErrors.push(err76);
                        }
                        errors++;
                      }
                      for (const key11 in data28) {
                        if (!(key11 === "id" || key11 === "description" || key11 === "status")) {
                          const err77 = { instancePath: instancePath + "/blocker", schemaPath: "#/anyOf/5/properties/blocker/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err77];
                          } else {
                            vErrors.push(err77);
                          }
                          errors++;
                        }
                      }
                      if (data28.id !== void 0) {
                        if (typeof data28.id !== "string") {
                          const err78 = { instancePath: instancePath + "/blocker/id", schemaPath: "#/anyOf/5/properties/blocker/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err78];
                          } else {
                            vErrors.push(err78);
                          }
                          errors++;
                        }
                      }
                      if (data28.description !== void 0) {
                        if (typeof data28.description !== "string") {
                          const err79 = { instancePath: instancePath + "/blocker/description", schemaPath: "#/anyOf/5/properties/blocker/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err79];
                          } else {
                            vErrors.push(err79);
                          }
                          errors++;
                        }
                      }
                      if (data28.status !== void 0) {
                        let data31 = data28.status;
                        if (typeof data31 !== "string") {
                          const err80 = { instancePath: instancePath + "/blocker/status", schemaPath: "#/anyOf/5/properties/blocker/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err80];
                          } else {
                            vErrors.push(err80);
                          }
                          errors++;
                        }
                        if (!(data31 === "active" || data31 === "resolved" || data31 === "superseded")) {
                          const err81 = { instancePath: instancePath + "/blocker/status", schemaPath: "#/anyOf/5/properties/blocker/properties/status/enum", keyword: "enum", params: { allowedValues: schema42.anyOf[5].properties.blocker.properties.status.enum }, message: "must be equal to one of the allowed values" };
                          if (vErrors === null) {
                            vErrors = [err81];
                          } else {
                            vErrors.push(err81);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err82 = { instancePath: instancePath + "/blocker", schemaPath: "#/anyOf/5/properties/blocker/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err82];
                      } else {
                        vErrors.push(err82);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err83 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err83];
                  } else {
                    vErrors.push(err83);
                  }
                  errors++;
                }
                var _valid0 = _errs74 === errors;
                valid0 = valid0 || _valid0;
              }
            }
          }
        }
      }
      if (!valid0) {
        const err84 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err84];
        } else {
          vErrors.push(err84);
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
      validate39.errors = vErrors;
      return errors === 0;
    }
    function validate38(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.protocolVersion === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.operations === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operations" }, message: "must have required property 'operations'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "protocolVersion" || key0 === "operations")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.protocolVersion !== void 0) {
          let data0 = data.protocolVersion;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (1 !== data0) {
            const err4 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.operations !== void 0) {
          let data1 = data.operations;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate39(data1[i0], { instancePath: instancePath + "/operations/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err5 = { instancePath: instancePath + "/operations", schemaPath: "#/properties/operations/type", keyword: "type", params: { type: "array" }, message: "must be array" };
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
      validate38.errors = vErrors;
      return errors === 0;
    }
    function validate49(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.stages === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "stages")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.stages !== void 0) {
          let data0 = data.stages;
          if (Array.isArray(data0)) {
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data1 = data0[i0];
              if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                if (data1.target === void 0) {
                  const err2 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteCandidateStageV1/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err2];
                  } else {
                    vErrors.push(err2);
                  }
                  errors++;
                }
                if (data1.acceptanceCriteria === void 0) {
                  const err3 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteCandidateStageV1/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                }
                for (const key1 in data1) {
                  if (!(key1 === "target" || key1 === "acceptanceCriteria")) {
                    const err4 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteCandidateStageV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err4];
                    } else {
                      vErrors.push(err4);
                    }
                    errors++;
                  }
                }
                if (data1.target !== void 0) {
                  if (typeof data1.target !== "string") {
                    const err5 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/GoalSnapshotPlanRouteCandidateStageV1/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err5];
                    } else {
                      vErrors.push(err5);
                    }
                    errors++;
                  }
                }
                if (data1.acceptanceCriteria !== void 0) {
                  let data3 = data1.acceptanceCriteria;
                  if (Array.isArray(data3)) {
                    const len1 = data3.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data3[i1] !== "string") {
                        const err6 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria/" + i1, schemaPath: "#/definitions/GoalSnapshotPlanRouteCandidateStageV1/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err6];
                        } else {
                          vErrors.push(err6);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err7 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria", schemaPath: "#/definitions/GoalSnapshotPlanRouteCandidateStageV1/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err7];
                    } else {
                      vErrors.push(err7);
                    }
                    errors++;
                  }
                }
              } else {
                const err8 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/GoalSnapshotPlanRouteCandidateStageV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
          } else {
            const err9 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
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
      validate49.errors = vErrors;
      return errors === 0;
    }
    function validate37(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.summary === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.evidenceSequences === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "evidenceSequences" }, message: "must have required property 'evidenceSequences'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "summary" || key0 === "evidenceSequences" || key0 === "memoryPatch")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if ("complete" !== data0) {
            const err5 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "complete" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.summary !== void 0) {
          if (typeof data.summary !== "string") {
            const err6 = { instancePath: instancePath + "/summary", schemaPath: "#/anyOf/0/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.evidenceSequences !== void 0) {
          let data2 = data.evidenceSequences;
          if (Array.isArray(data2)) {
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data3 = data2[i0];
              if (!(typeof data3 == "number" && isFinite(data3))) {
                const err7 = { instancePath: instancePath + "/evidenceSequences/" + i0, schemaPath: "#/anyOf/0/properties/evidenceSequences/items/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
          } else {
            const err8 = { instancePath: instancePath + "/evidenceSequences", schemaPath: "#/anyOf/0/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.memoryPatch !== void 0) {
          if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
            vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs13 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err10 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (data.summary === void 0) {
            const err11 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (data.completionEvidence === void 0) {
            const err12 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "completionEvidence" }, message: "must have required property 'completionEvidence'" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "summary" || key1 === "completionEvidence" || key1 === "memoryPatch")) {
              const err13 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data5 = data.kind;
            if (typeof data5 !== "string") {
              const err14 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if ("complete" !== data5) {
              const err15 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "complete" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
          if (data.summary !== void 0) {
            if (typeof data.summary !== "string") {
              const err16 = { instancePath: instancePath + "/summary", schemaPath: "#/anyOf/1/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.completionEvidence !== void 0) {
            let data7 = data.completionEvidence;
            if (Array.isArray(data7)) {
              const len1 = data7.length;
              for (let i1 = 0; i1 < len1; i1++) {
                let data8 = data7[i1];
                if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                  if (data8.criterionIndex === void 0) {
                    const err17 = { instancePath: instancePath + "/completionEvidence/" + i1, schemaPath: "#/definitions/GoalSnapshotCompletionEvidenceV1/required", keyword: "required", params: { missingProperty: "criterionIndex" }, message: "must have required property 'criterionIndex'" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                  if (data8.evidenceSequences === void 0) {
                    const err18 = { instancePath: instancePath + "/completionEvidence/" + i1, schemaPath: "#/definitions/GoalSnapshotCompletionEvidenceV1/required", keyword: "required", params: { missingProperty: "evidenceSequences" }, message: "must have required property 'evidenceSequences'" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                  for (const key2 in data8) {
                    if (!(key2 === "criterionIndex" || key2 === "evidenceSequences")) {
                      const err19 = { instancePath: instancePath + "/completionEvidence/" + i1, schemaPath: "#/definitions/GoalSnapshotCompletionEvidenceV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err19];
                      } else {
                        vErrors.push(err19);
                      }
                      errors++;
                    }
                  }
                  if (data8.criterionIndex !== void 0) {
                    let data9 = data8.criterionIndex;
                    if (!(typeof data9 == "number" && isFinite(data9))) {
                      const err20 = { instancePath: instancePath + "/completionEvidence/" + i1 + "/criterionIndex", schemaPath: "#/definitions/GoalSnapshotCompletionEvidenceV1/properties/criterionIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                      if (vErrors === null) {
                        vErrors = [err20];
                      } else {
                        vErrors.push(err20);
                      }
                      errors++;
                    }
                  }
                  if (data8.evidenceSequences !== void 0) {
                    let data10 = data8.evidenceSequences;
                    if (Array.isArray(data10)) {
                      const len2 = data10.length;
                      for (let i2 = 0; i2 < len2; i2++) {
                        let data11 = data10[i2];
                        if (!(typeof data11 == "number" && isFinite(data11))) {
                          const err21 = { instancePath: instancePath + "/completionEvidence/" + i1 + "/evidenceSequences/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletionEvidenceV1/properties/evidenceSequences/items/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                          if (vErrors === null) {
                            vErrors = [err21];
                          } else {
                            vErrors.push(err21);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err22 = { instancePath: instancePath + "/completionEvidence/" + i1 + "/evidenceSequences", schemaPath: "#/definitions/GoalSnapshotCompletionEvidenceV1/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                      if (vErrors === null) {
                        vErrors = [err22];
                      } else {
                        vErrors.push(err22);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err23 = { instancePath: instancePath + "/completionEvidence/" + i1, schemaPath: "#/definitions/GoalSnapshotCompletionEvidenceV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
              }
            } else {
              const err24 = { instancePath: instancePath + "/completionEvidence", schemaPath: "#/anyOf/1/properties/completionEvidence/type", keyword: "type", params: { type: "array" }, message: "must be array" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
          if (data.memoryPatch !== void 0) {
            if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
              vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err25 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs33 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err26 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data.reason === void 0) {
              const err27 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            for (const key3 in data) {
              if (!(key3 === "kind" || key3 === "reason" || key3 === "memoryPatch")) {
                const err28 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data13 = data.kind;
              if (typeof data13 !== "string") {
                const err29 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
              if ("wait" !== data13) {
                const err30 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "wait" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data.reason !== void 0) {
              if (typeof data.reason !== "string") {
                const err31 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/2/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data.memoryPatch !== void 0) {
              if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
                vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err32 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          var _valid0 = _errs33 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs41 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err33 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
              if (data.error === void 0) {
                const err34 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
              for (const key4 in data) {
                if (!(key4 === "kind" || key4 === "error" || key4 === "memoryPatch")) {
                  const err35 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data16 = data.kind;
                if (typeof data16 !== "string") {
                  const err36 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                if ("fail" !== data16) {
                  const err37 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "fail" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err37];
                  } else {
                    vErrors.push(err37);
                  }
                  errors++;
                }
              }
              if (data.error !== void 0) {
                if (typeof data.error !== "string") {
                  const err38 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/3/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
              }
              if (data.memoryPatch !== void 0) {
                if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
                  vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                  errors = vErrors.length;
                }
              }
            } else {
              const err39 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            var _valid0 = _errs41 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs49 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.kind === void 0) {
                  const err40 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
                for (const key5 in data) {
                  if (!func2.call(schema40.anyOf[4].properties, key5)) {
                    const err41 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                }
                if (data.kind !== void 0) {
                  let data19 = data.kind;
                  if (typeof data19 !== "string") {
                    const err42 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err42];
                    } else {
                      vErrors.push(err42);
                    }
                    errors++;
                  }
                  if ("context_lookup" !== data19) {
                    const err43 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "context_lookup" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                }
                if (data.operation !== void 0) {
                  let data20 = data.operation;
                  if (typeof data20 !== "string") {
                    const err44 = { instancePath: instancePath + "/operation", schemaPath: "#/anyOf/4/properties/operation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                  if (!(data20 === "history_search" || data20 === "directory_browse" || data20 === "directory_search" || data20 === "source_expand")) {
                    const err45 = { instancePath: instancePath + "/operation", schemaPath: "#/anyOf/4/properties/operation/enum", keyword: "enum", params: { allowedValues: schema40.anyOf[4].properties.operation.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                }
                if (data.need !== void 0) {
                  let data21 = data.need;
                  if (typeof data21 !== "string") {
                    const err46 = { instancePath: instancePath + "/need", schemaPath: "#/anyOf/4/properties/need/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                  if (!(data21 === "conversation_history" || data21 === "historical_execution" || data21 === "decision_rationale")) {
                    const err47 = { instancePath: instancePath + "/need", schemaPath: "#/anyOf/4/properties/need/enum", keyword: "enum", params: { allowedValues: schema40.anyOf[4].properties.need.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err47];
                    } else {
                      vErrors.push(err47);
                    }
                    errors++;
                  }
                }
                if (data.question !== void 0) {
                  if (typeof data.question !== "string") {
                    const err48 = { instancePath: instancePath + "/question", schemaPath: "#/anyOf/4/properties/question/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err48];
                    } else {
                      vErrors.push(err48);
                    }
                    errors++;
                  }
                }
                if (data.filters !== void 0) {
                  let data23 = data.filters;
                  if (data23 && typeof data23 == "object" && !Array.isArray(data23)) {
                    for (const key6 in data23) {
                      if (!(key6 === "eventTypes" || key6 === "toolIds" || key6 === "actionIds" || key6 === "stepIndexes" || key6 === "paths" || key6 === "errorCodes" || key6 === "objectIds" || key6 === "sequenceRange")) {
                        const err49 = { instancePath: instancePath + "/filters", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err49];
                        } else {
                          vErrors.push(err49);
                        }
                        errors++;
                      }
                    }
                    if (data23.eventTypes !== void 0) {
                      let data24 = data23.eventTypes;
                      if (Array.isArray(data24)) {
                        const len3 = data24.length;
                        for (let i3 = 0; i3 < len3; i3++) {
                          if (typeof data24[i3] !== "string") {
                            const err50 = { instancePath: instancePath + "/filters/eventTypes/" + i3, schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/eventTypes/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err50];
                            } else {
                              vErrors.push(err50);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err51 = { instancePath: instancePath + "/filters/eventTypes", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/eventTypes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err51];
                        } else {
                          vErrors.push(err51);
                        }
                        errors++;
                      }
                    }
                    if (data23.toolIds !== void 0) {
                      let data26 = data23.toolIds;
                      if (Array.isArray(data26)) {
                        const len4 = data26.length;
                        for (let i4 = 0; i4 < len4; i4++) {
                          if (typeof data26[i4] !== "string") {
                            const err52 = { instancePath: instancePath + "/filters/toolIds/" + i4, schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/toolIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err52];
                            } else {
                              vErrors.push(err52);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err53 = { instancePath: instancePath + "/filters/toolIds", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/toolIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err53];
                        } else {
                          vErrors.push(err53);
                        }
                        errors++;
                      }
                    }
                    if (data23.actionIds !== void 0) {
                      let data28 = data23.actionIds;
                      if (Array.isArray(data28)) {
                        const len5 = data28.length;
                        for (let i5 = 0; i5 < len5; i5++) {
                          if (typeof data28[i5] !== "string") {
                            const err54 = { instancePath: instancePath + "/filters/actionIds/" + i5, schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/actionIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err54];
                            } else {
                              vErrors.push(err54);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err55 = { instancePath: instancePath + "/filters/actionIds", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/actionIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err55];
                        } else {
                          vErrors.push(err55);
                        }
                        errors++;
                      }
                    }
                    if (data23.stepIndexes !== void 0) {
                      let data30 = data23.stepIndexes;
                      if (Array.isArray(data30)) {
                        const len6 = data30.length;
                        for (let i6 = 0; i6 < len6; i6++) {
                          let data31 = data30[i6];
                          if (!(typeof data31 == "number" && isFinite(data31))) {
                            const err56 = { instancePath: instancePath + "/filters/stepIndexes/" + i6, schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/stepIndexes/items/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                            if (vErrors === null) {
                              vErrors = [err56];
                            } else {
                              vErrors.push(err56);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err57 = { instancePath: instancePath + "/filters/stepIndexes", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/stepIndexes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err57];
                        } else {
                          vErrors.push(err57);
                        }
                        errors++;
                      }
                    }
                    if (data23.paths !== void 0) {
                      let data32 = data23.paths;
                      if (Array.isArray(data32)) {
                        const len7 = data32.length;
                        for (let i7 = 0; i7 < len7; i7++) {
                          if (typeof data32[i7] !== "string") {
                            const err58 = { instancePath: instancePath + "/filters/paths/" + i7, schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/paths/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err58];
                            } else {
                              vErrors.push(err58);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err59 = { instancePath: instancePath + "/filters/paths", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/paths/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err59];
                        } else {
                          vErrors.push(err59);
                        }
                        errors++;
                      }
                    }
                    if (data23.errorCodes !== void 0) {
                      let data34 = data23.errorCodes;
                      if (Array.isArray(data34)) {
                        const len8 = data34.length;
                        for (let i8 = 0; i8 < len8; i8++) {
                          if (typeof data34[i8] !== "string") {
                            const err60 = { instancePath: instancePath + "/filters/errorCodes/" + i8, schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/errorCodes/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err60];
                            } else {
                              vErrors.push(err60);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err61 = { instancePath: instancePath + "/filters/errorCodes", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/errorCodes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err61];
                        } else {
                          vErrors.push(err61);
                        }
                        errors++;
                      }
                    }
                    if (data23.objectIds !== void 0) {
                      let data36 = data23.objectIds;
                      if (Array.isArray(data36)) {
                        const len9 = data36.length;
                        for (let i9 = 0; i9 < len9; i9++) {
                          if (typeof data36[i9] !== "string") {
                            const err62 = { instancePath: instancePath + "/filters/objectIds/" + i9, schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/objectIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err62];
                            } else {
                              vErrors.push(err62);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err63 = { instancePath: instancePath + "/filters/objectIds", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/objectIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err63];
                        } else {
                          vErrors.push(err63);
                        }
                        errors++;
                      }
                    }
                    if (data23.sequenceRange !== void 0) {
                      let data38 = data23.sequenceRange;
                      if (data38 && typeof data38 == "object" && !Array.isArray(data38)) {
                        if (data38.from === void 0) {
                          const err64 = { instancePath: instancePath + "/filters/sequenceRange", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/sequenceRange/required", keyword: "required", params: { missingProperty: "from" }, message: "must have required property 'from'" };
                          if (vErrors === null) {
                            vErrors = [err64];
                          } else {
                            vErrors.push(err64);
                          }
                          errors++;
                        }
                        if (data38.to === void 0) {
                          const err65 = { instancePath: instancePath + "/filters/sequenceRange", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/sequenceRange/required", keyword: "required", params: { missingProperty: "to" }, message: "must have required property 'to'" };
                          if (vErrors === null) {
                            vErrors = [err65];
                          } else {
                            vErrors.push(err65);
                          }
                          errors++;
                        }
                        for (const key7 in data38) {
                          if (!(key7 === "from" || key7 === "to")) {
                            const err66 = { instancePath: instancePath + "/filters/sequenceRange", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/sequenceRange/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err66];
                            } else {
                              vErrors.push(err66);
                            }
                            errors++;
                          }
                        }
                        if (data38.from !== void 0) {
                          let data39 = data38.from;
                          if (!(typeof data39 == "number" && isFinite(data39))) {
                            const err67 = { instancePath: instancePath + "/filters/sequenceRange/from", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/sequenceRange/properties/from/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                            if (vErrors === null) {
                              vErrors = [err67];
                            } else {
                              vErrors.push(err67);
                            }
                            errors++;
                          }
                        }
                        if (data38.to !== void 0) {
                          let data40 = data38.to;
                          if (!(typeof data40 == "number" && isFinite(data40))) {
                            const err68 = { instancePath: instancePath + "/filters/sequenceRange/to", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/sequenceRange/properties/to/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                            if (vErrors === null) {
                              vErrors = [err68];
                            } else {
                              vErrors.push(err68);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err69 = { instancePath: instancePath + "/filters/sequenceRange", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/properties/sequenceRange/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err69];
                        } else {
                          vErrors.push(err69);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err70 = { instancePath: instancePath + "/filters", schemaPath: "#/definitions/GoalSnapshotContextLookupFiltersV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err70];
                    } else {
                      vErrors.push(err70);
                    }
                    errors++;
                  }
                }
                if (data.query !== void 0) {
                  if (typeof data.query !== "string") {
                    const err71 = { instancePath: instancePath + "/query", schemaPath: "#/anyOf/4/properties/query/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                }
                if (data.cursor !== void 0) {
                  if (typeof data.cursor !== "string") {
                    const err72 = { instancePath: instancePath + "/cursor", schemaPath: "#/anyOf/4/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                }
                if (data.limit !== void 0) {
                  let data43 = data.limit;
                  if (!(typeof data43 == "number" && isFinite(data43))) {
                    const err73 = { instancePath: instancePath + "/limit", schemaPath: "#/anyOf/4/properties/limit/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  }
                }
                if (data.category !== void 0) {
                  if (typeof data.category !== "string") {
                    const err74 = { instancePath: instancePath + "/category", schemaPath: "#/anyOf/4/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err74];
                    } else {
                      vErrors.push(err74);
                    }
                    errors++;
                  }
                }
                if (data.sourceRef !== void 0) {
                  if (typeof data.sourceRef !== "string") {
                    const err75 = { instancePath: instancePath + "/sourceRef", schemaPath: "#/anyOf/4/properties/sourceRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err75];
                    } else {
                      vErrors.push(err75);
                    }
                    errors++;
                  }
                }
                if (data.offset !== void 0) {
                  let data46 = data.offset;
                  if (!(typeof data46 == "number" && isFinite(data46))) {
                    const err76 = { instancePath: instancePath + "/offset", schemaPath: "#/anyOf/4/properties/offset/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err76];
                    } else {
                      vErrors.push(err76);
                    }
                    errors++;
                  }
                }
              } else {
                const err77 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err77];
                } else {
                  vErrors.push(err77);
                }
                errors++;
              }
              var _valid0 = _errs49 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs111 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.kind === void 0) {
                    const err78 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err78];
                    } else {
                      vErrors.push(err78);
                    }
                    errors++;
                  }
                  if (data.query === void 0) {
                    const err79 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "query" }, message: "must have required property 'query'" };
                    if (vErrors === null) {
                      vErrors = [err79];
                    } else {
                      vErrors.push(err79);
                    }
                    errors++;
                  }
                  for (const key8 in data) {
                    if (!(key8 === "kind" || key8 === "query")) {
                      const err80 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err80];
                      } else {
                        vErrors.push(err80);
                      }
                      errors++;
                    }
                  }
                  if (data.kind !== void 0) {
                    let data47 = data.kind;
                    if (typeof data47 !== "string") {
                      const err81 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err81];
                      } else {
                        vErrors.push(err81);
                      }
                      errors++;
                    }
                    if ("tool_discovery" !== data47) {
                      const err82 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "tool_discovery" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err82];
                      } else {
                        vErrors.push(err82);
                      }
                      errors++;
                    }
                  }
                  if (data.query !== void 0) {
                    if (typeof data.query !== "string") {
                      const err83 = { instancePath: instancePath + "/query", schemaPath: "#/anyOf/5/properties/query/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err83];
                      } else {
                        vErrors.push(err83);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err84 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err84];
                  } else {
                    vErrors.push(err84);
                  }
                  errors++;
                }
                var _valid0 = _errs111 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs118 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.kind === void 0) {
                      const err85 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err85];
                      } else {
                        vErrors.push(err85);
                      }
                      errors++;
                    }
                    if (data.baseRevision === void 0) {
                      const err86 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "baseRevision" }, message: "must have required property 'baseRevision'" };
                      if (vErrors === null) {
                        vErrors = [err86];
                      } else {
                        vErrors.push(err86);
                      }
                      errors++;
                    }
                    if (data.operations === void 0) {
                      const err87 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "operations" }, message: "must have required property 'operations'" };
                      if (vErrors === null) {
                        vErrors = [err87];
                      } else {
                        vErrors.push(err87);
                      }
                      errors++;
                    }
                    for (const key9 in data) {
                      if (!(key9 === "kind" || key9 === "baseRevision" || key9 === "operations" || key9 === "memoryPatch")) {
                        const err88 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err88];
                        } else {
                          vErrors.push(err88);
                        }
                        errors++;
                      }
                    }
                    if (data.kind !== void 0) {
                      let data49 = data.kind;
                      if (typeof data49 !== "string") {
                        const err89 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err89];
                        } else {
                          vErrors.push(err89);
                        }
                        errors++;
                      }
                      if ("goal_plan_update" !== data49) {
                        const err90 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "goal_plan_update" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err90];
                        } else {
                          vErrors.push(err90);
                        }
                        errors++;
                      }
                    }
                    if (data.baseRevision !== void 0) {
                      let data50 = data.baseRevision;
                      if (!(typeof data50 == "number" && isFinite(data50))) {
                        const err91 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/anyOf/6/properties/baseRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err91];
                        } else {
                          vErrors.push(err91);
                        }
                        errors++;
                      }
                    }
                    if (data.operations !== void 0) {
                      let data51 = data.operations;
                      if (Array.isArray(data51)) {
                        const len10 = data51.length;
                        for (let i10 = 0; i10 < len10; i10++) {
                          let data52 = data51[i10];
                          const _errs129 = errors;
                          let valid36 = false;
                          const _errs130 = errors;
                          if (data52 && typeof data52 == "object" && !Array.isArray(data52)) {
                            if (data52.type === void 0) {
                              const err92 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                              if (vErrors === null) {
                                vErrors = [err92];
                              } else {
                                vErrors.push(err92);
                              }
                              errors++;
                            }
                            if (data52.content === void 0) {
                              const err93 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                              if (vErrors === null) {
                                vErrors = [err93];
                              } else {
                                vErrors.push(err93);
                              }
                              errors++;
                            }
                            for (const key10 in data52) {
                              if (!(key10 === "type" || key10 === "content" || key10 === "position")) {
                                const err94 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err94];
                                } else {
                                  vErrors.push(err94);
                                }
                                errors++;
                              }
                            }
                            if (data52.type !== void 0) {
                              let data53 = data52.type;
                              if (typeof data53 !== "string") {
                                const err95 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err95];
                                } else {
                                  vErrors.push(err95);
                                }
                                errors++;
                              }
                              if ("add" !== data53) {
                                const err96 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/properties/type/const", keyword: "const", params: { allowedValue: "add" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err96];
                                } else {
                                  vErrors.push(err96);
                                }
                                errors++;
                              }
                            }
                            if (data52.content !== void 0) {
                              if (typeof data52.content !== "string") {
                                const err97 = { instancePath: instancePath + "/operations/" + i10 + "/content", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err97];
                                } else {
                                  vErrors.push(err97);
                                }
                                errors++;
                              }
                            }
                            if (data52.position !== void 0) {
                              let data55 = data52.position;
                              if (!(typeof data55 == "number" && isFinite(data55))) {
                                const err98 = { instancePath: instancePath + "/operations/" + i10 + "/position", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/properties/position/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                                if (vErrors === null) {
                                  vErrors = [err98];
                                } else {
                                  vErrors.push(err98);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err99 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err99];
                            } else {
                              vErrors.push(err99);
                            }
                            errors++;
                          }
                          var _valid1 = _errs130 === errors;
                          valid36 = valid36 || _valid1;
                          if (!valid36) {
                            const _errs139 = errors;
                            if (data52 && typeof data52 == "object" && !Array.isArray(data52)) {
                              if (data52.type === void 0) {
                                const err100 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                if (vErrors === null) {
                                  vErrors = [err100];
                                } else {
                                  vErrors.push(err100);
                                }
                                errors++;
                              }
                              if (data52.id === void 0) {
                                const err101 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                if (vErrors === null) {
                                  vErrors = [err101];
                                } else {
                                  vErrors.push(err101);
                                }
                                errors++;
                              }
                              for (const key11 in data52) {
                                if (!(key11 === "type" || key11 === "id" || key11 === "content" || key11 === "status" || key11 === "evidenceSequences")) {
                                  const err102 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err102];
                                  } else {
                                    vErrors.push(err102);
                                  }
                                  errors++;
                                }
                              }
                              if (data52.type !== void 0) {
                                let data56 = data52.type;
                                if (typeof data56 !== "string") {
                                  const err103 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err103];
                                  } else {
                                    vErrors.push(err103);
                                  }
                                  errors++;
                                }
                                if ("update" !== data56) {
                                  const err104 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "update" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err104];
                                  } else {
                                    vErrors.push(err104);
                                  }
                                  errors++;
                                }
                              }
                              if (data52.id !== void 0) {
                                if (typeof data52.id !== "string") {
                                  const err105 = { instancePath: instancePath + "/operations/" + i10 + "/id", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err105];
                                  } else {
                                    vErrors.push(err105);
                                  }
                                  errors++;
                                }
                              }
                              if (data52.content !== void 0) {
                                if (typeof data52.content !== "string") {
                                  const err106 = { instancePath: instancePath + "/operations/" + i10 + "/content", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err106];
                                  } else {
                                    vErrors.push(err106);
                                  }
                                  errors++;
                                }
                              }
                              if (data52.status !== void 0) {
                                let data59 = data52.status;
                                if (typeof data59 !== "string") {
                                  const err107 = { instancePath: instancePath + "/operations/" + i10 + "/status", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err107];
                                  } else {
                                    vErrors.push(err107);
                                  }
                                  errors++;
                                }
                                if (!(data59 === "pending" || data59 === "in_progress" || data59 === "completed" || data59 === "cancelled")) {
                                  const err108 = { instancePath: instancePath + "/operations/" + i10 + "/status", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/status/enum", keyword: "enum", params: { allowedValues: schema45.anyOf[1].properties.status.enum }, message: "must be equal to one of the allowed values" };
                                  if (vErrors === null) {
                                    vErrors = [err108];
                                  } else {
                                    vErrors.push(err108);
                                  }
                                  errors++;
                                }
                              }
                              if (data52.evidenceSequences !== void 0) {
                                let data60 = data52.evidenceSequences;
                                if (Array.isArray(data60)) {
                                  const len11 = data60.length;
                                  for (let i11 = 0; i11 < len11; i11++) {
                                    let data61 = data60[i11];
                                    if (!(typeof data61 == "number" && isFinite(data61))) {
                                      const err109 = { instancePath: instancePath + "/operations/" + i10 + "/evidenceSequences/" + i11, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/evidenceSequences/items/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                                      if (vErrors === null) {
                                        vErrors = [err109];
                                      } else {
                                        vErrors.push(err109);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err110 = { instancePath: instancePath + "/operations/" + i10 + "/evidenceSequences", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                  if (vErrors === null) {
                                    vErrors = [err110];
                                  } else {
                                    vErrors.push(err110);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err111 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err111];
                              } else {
                                vErrors.push(err111);
                              }
                              errors++;
                            }
                            var _valid1 = _errs139 === errors;
                            valid36 = valid36 || _valid1;
                            if (!valid36) {
                              const _errs154 = errors;
                              if (data52 && typeof data52 == "object" && !Array.isArray(data52)) {
                                if (data52.type === void 0) {
                                  const err112 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                  if (vErrors === null) {
                                    vErrors = [err112];
                                  } else {
                                    vErrors.push(err112);
                                  }
                                  errors++;
                                }
                                if (data52.id === void 0) {
                                  const err113 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                  if (vErrors === null) {
                                    vErrors = [err113];
                                  } else {
                                    vErrors.push(err113);
                                  }
                                  errors++;
                                }
                                if (data52.position === void 0) {
                                  const err114 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
                                  if (vErrors === null) {
                                    vErrors = [err114];
                                  } else {
                                    vErrors.push(err114);
                                  }
                                  errors++;
                                }
                                for (const key12 in data52) {
                                  if (!(key12 === "type" || key12 === "id" || key12 === "position")) {
                                    const err115 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                                    if (vErrors === null) {
                                      vErrors = [err115];
                                    } else {
                                      vErrors.push(err115);
                                    }
                                    errors++;
                                  }
                                }
                                if (data52.type !== void 0) {
                                  let data62 = data52.type;
                                  if (typeof data62 !== "string") {
                                    const err116 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err116];
                                    } else {
                                      vErrors.push(err116);
                                    }
                                    errors++;
                                  }
                                  if ("reorder" !== data62) {
                                    const err117 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/properties/type/const", keyword: "const", params: { allowedValue: "reorder" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err117];
                                    } else {
                                      vErrors.push(err117);
                                    }
                                    errors++;
                                  }
                                }
                                if (data52.id !== void 0) {
                                  if (typeof data52.id !== "string") {
                                    const err118 = { instancePath: instancePath + "/operations/" + i10 + "/id", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err118];
                                    } else {
                                      vErrors.push(err118);
                                    }
                                    errors++;
                                  }
                                }
                                if (data52.position !== void 0) {
                                  let data64 = data52.position;
                                  if (!(typeof data64 == "number" && isFinite(data64))) {
                                    const err119 = { instancePath: instancePath + "/operations/" + i10 + "/position", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/properties/position/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                                    if (vErrors === null) {
                                      vErrors = [err119];
                                    } else {
                                      vErrors.push(err119);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err120 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                if (vErrors === null) {
                                  vErrors = [err120];
                                } else {
                                  vErrors.push(err120);
                                }
                                errors++;
                              }
                              var _valid1 = _errs154 === errors;
                              valid36 = valid36 || _valid1;
                              if (!valid36) {
                                const _errs163 = errors;
                                if (data52 && typeof data52 == "object" && !Array.isArray(data52)) {
                                  if (data52.type === void 0) {
                                    const err121 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/3/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                    if (vErrors === null) {
                                      vErrors = [err121];
                                    } else {
                                      vErrors.push(err121);
                                    }
                                    errors++;
                                  }
                                  if (data52.id === void 0) {
                                    const err122 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/3/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                    if (vErrors === null) {
                                      vErrors = [err122];
                                    } else {
                                      vErrors.push(err122);
                                    }
                                    errors++;
                                  }
                                  for (const key13 in data52) {
                                    if (!(key13 === "type" || key13 === "id")) {
                                      const err123 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key13 }, message: "must NOT have additional properties" };
                                      if (vErrors === null) {
                                        vErrors = [err123];
                                      } else {
                                        vErrors.push(err123);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data52.type !== void 0) {
                                    let data65 = data52.type;
                                    if (typeof data65 !== "string") {
                                      const err124 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/3/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err124];
                                      } else {
                                        vErrors.push(err124);
                                      }
                                      errors++;
                                    }
                                    if ("cancel" !== data65) {
                                      const err125 = { instancePath: instancePath + "/operations/" + i10 + "/type", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/3/properties/type/const", keyword: "const", params: { allowedValue: "cancel" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err125];
                                      } else {
                                        vErrors.push(err125);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data52.id !== void 0) {
                                    if (typeof data52.id !== "string") {
                                      const err126 = { instancePath: instancePath + "/operations/" + i10 + "/id", schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/3/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err126];
                                      } else {
                                        vErrors.push(err126);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err127 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                  if (vErrors === null) {
                                    vErrors = [err127];
                                  } else {
                                    vErrors.push(err127);
                                  }
                                  errors++;
                                }
                                var _valid1 = _errs163 === errors;
                                valid36 = valid36 || _valid1;
                              }
                            }
                          }
                          if (!valid36) {
                            const err128 = { instancePath: instancePath + "/operations/" + i10, schemaPath: "#/definitions/GoalSnapshotGoalPlanPatchOperationV1/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                            if (vErrors === null) {
                              vErrors = [err128];
                            } else {
                              vErrors.push(err128);
                            }
                            errors++;
                          } else {
                            errors = _errs129;
                            if (vErrors !== null) {
                              if (_errs129) {
                                vErrors.length = _errs129;
                              } else {
                                vErrors = null;
                              }
                            }
                          }
                        }
                      } else {
                        const err129 = { instancePath: instancePath + "/operations", schemaPath: "#/anyOf/6/properties/operations/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err129];
                        } else {
                          vErrors.push(err129);
                        }
                        errors++;
                      }
                    }
                    if (data.memoryPatch !== void 0) {
                      if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
                        vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                        errors = vErrors.length;
                      }
                    }
                  } else {
                    const err130 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err130];
                    } else {
                      vErrors.push(err130);
                    }
                    errors++;
                  }
                  var _valid0 = _errs118 === errors;
                  valid0 = valid0 || _valid0;
                  if (!valid0) {
                    const _errs171 = errors;
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      if (data.kind === void 0) {
                        const err131 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err131];
                        } else {
                          vErrors.push(err131);
                        }
                        errors++;
                      }
                      if (data.target === void 0) {
                        const err132 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                        if (vErrors === null) {
                          vErrors = [err132];
                        } else {
                          vErrors.push(err132);
                        }
                        errors++;
                      }
                      if (data.acceptanceCriteria === void 0) {
                        const err133 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                        if (vErrors === null) {
                          vErrors = [err133];
                        } else {
                          vErrors.push(err133);
                        }
                        errors++;
                      }
                      for (const key14 in data) {
                        if (!(key14 === "kind" || key14 === "stageId" || key14 === "baseRevision" || key14 === "reason" || key14 === "target" || key14 === "acceptanceCriteria" || key14 === "memoryPatch")) {
                          const err134 = { instancePath, schemaPath: "#/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key14 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err134];
                          } else {
                            vErrors.push(err134);
                          }
                          errors++;
                        }
                      }
                      if (data.kind !== void 0) {
                        let data68 = data.kind;
                        if (typeof data68 !== "string") {
                          const err135 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err135];
                          } else {
                            vErrors.push(err135);
                          }
                          errors++;
                        }
                        if ("run_stage_update" !== data68) {
                          const err136 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "run_stage_update" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err136];
                          } else {
                            vErrors.push(err136);
                          }
                          errors++;
                        }
                      }
                      if (data.stageId !== void 0) {
                        if (typeof data.stageId !== "string") {
                          const err137 = { instancePath: instancePath + "/stageId", schemaPath: "#/anyOf/7/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err137];
                          } else {
                            vErrors.push(err137);
                          }
                          errors++;
                        }
                      }
                      if (data.baseRevision !== void 0) {
                        let data70 = data.baseRevision;
                        if (!(typeof data70 == "number" && isFinite(data70))) {
                          const err138 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/anyOf/7/properties/baseRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                          if (vErrors === null) {
                            vErrors = [err138];
                          } else {
                            vErrors.push(err138);
                          }
                          errors++;
                        }
                      }
                      if (data.reason !== void 0) {
                        if (typeof data.reason !== "string") {
                          const err139 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/7/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err139];
                          } else {
                            vErrors.push(err139);
                          }
                          errors++;
                        }
                      }
                      if (data.target !== void 0) {
                        if (typeof data.target !== "string") {
                          const err140 = { instancePath: instancePath + "/target", schemaPath: "#/anyOf/7/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err140];
                          } else {
                            vErrors.push(err140);
                          }
                          errors++;
                        }
                      }
                      if (data.acceptanceCriteria !== void 0) {
                        let data73 = data.acceptanceCriteria;
                        if (Array.isArray(data73)) {
                          const len12 = data73.length;
                          for (let i12 = 0; i12 < len12; i12++) {
                            if (typeof data73[i12] !== "string") {
                              const err141 = { instancePath: instancePath + "/acceptanceCriteria/" + i12, schemaPath: "#/anyOf/7/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err141];
                              } else {
                                vErrors.push(err141);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err142 = { instancePath: instancePath + "/acceptanceCriteria", schemaPath: "#/anyOf/7/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                          if (vErrors === null) {
                            vErrors = [err142];
                          } else {
                            vErrors.push(err142);
                          }
                          errors++;
                        }
                      }
                      if (data.memoryPatch !== void 0) {
                        if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
                          vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                          errors = vErrors.length;
                        }
                      }
                    } else {
                      const err143 = { instancePath, schemaPath: "#/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err143];
                      } else {
                        vErrors.push(err143);
                      }
                      errors++;
                    }
                    var _valid0 = _errs171 === errors;
                    valid0 = valid0 || _valid0;
                    if (!valid0) {
                      const _errs189 = errors;
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        if (data.kind === void 0) {
                          const err144 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err144];
                          } else {
                            vErrors.push(err144);
                          }
                          errors++;
                        }
                        if (data.stageId === void 0) {
                          const err145 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
                          if (vErrors === null) {
                            vErrors = [err145];
                          } else {
                            vErrors.push(err145);
                          }
                          errors++;
                        }
                        if (data.summary === void 0) {
                          const err146 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
                          if (vErrors === null) {
                            vErrors = [err146];
                          } else {
                            vErrors.push(err146);
                          }
                          errors++;
                        }
                        for (const key15 in data) {
                          if (!(key15 === "kind" || key15 === "stageId" || key15 === "summary" || key15 === "evidenceSequences" || key15 === "memoryPatch")) {
                            const err147 = { instancePath, schemaPath: "#/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key15 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err147];
                            } else {
                              vErrors.push(err147);
                            }
                            errors++;
                          }
                        }
                        if (data.kind !== void 0) {
                          let data76 = data.kind;
                          if (typeof data76 !== "string") {
                            const err148 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err148];
                            } else {
                              vErrors.push(err148);
                            }
                            errors++;
                          }
                          if ("run_stage_complete" !== data76) {
                            const err149 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/const", keyword: "const", params: { allowedValue: "run_stage_complete" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err149];
                            } else {
                              vErrors.push(err149);
                            }
                            errors++;
                          }
                        }
                        if (data.stageId !== void 0) {
                          if (typeof data.stageId !== "string") {
                            const err150 = { instancePath: instancePath + "/stageId", schemaPath: "#/anyOf/8/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err150];
                            } else {
                              vErrors.push(err150);
                            }
                            errors++;
                          }
                        }
                        if (data.summary !== void 0) {
                          if (typeof data.summary !== "string") {
                            const err151 = { instancePath: instancePath + "/summary", schemaPath: "#/anyOf/8/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err151];
                            } else {
                              vErrors.push(err151);
                            }
                            errors++;
                          }
                        }
                        if (data.evidenceSequences !== void 0) {
                          let data79 = data.evidenceSequences;
                          if (Array.isArray(data79)) {
                            const len13 = data79.length;
                            for (let i13 = 0; i13 < len13; i13++) {
                              let data80 = data79[i13];
                              if (!(typeof data80 == "number" && isFinite(data80))) {
                                const err152 = { instancePath: instancePath + "/evidenceSequences/" + i13, schemaPath: "#/anyOf/8/properties/evidenceSequences/items/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                                if (vErrors === null) {
                                  vErrors = [err152];
                                } else {
                                  vErrors.push(err152);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err153 = { instancePath: instancePath + "/evidenceSequences", schemaPath: "#/anyOf/8/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                            if (vErrors === null) {
                              vErrors = [err153];
                            } else {
                              vErrors.push(err153);
                            }
                            errors++;
                          }
                        }
                        if (data.memoryPatch !== void 0) {
                          if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
                            vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                            errors = vErrors.length;
                          }
                        }
                      } else {
                        const err154 = { instancePath, schemaPath: "#/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err154];
                        } else {
                          vErrors.push(err154);
                        }
                        errors++;
                      }
                      var _valid0 = _errs189 === errors;
                      valid0 = valid0 || _valid0;
                      if (!valid0) {
                        const _errs203 = errors;
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          if (data.kind === void 0) {
                            const err155 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                            if (vErrors === null) {
                              vErrors = [err155];
                            } else {
                              vErrors.push(err155);
                            }
                            errors++;
                          }
                          if (data.baseRevision === void 0) {
                            const err156 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "baseRevision" }, message: "must have required property 'baseRevision'" };
                            if (vErrors === null) {
                              vErrors = [err156];
                            } else {
                              vErrors.push(err156);
                            }
                            errors++;
                          }
                          if (data.reason === void 0) {
                            const err157 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                            if (vErrors === null) {
                              vErrors = [err157];
                            } else {
                              vErrors.push(err157);
                            }
                            errors++;
                          }
                          if (data.route === void 0) {
                            const err158 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "route" }, message: "must have required property 'route'" };
                            if (vErrors === null) {
                              vErrors = [err158];
                            } else {
                              vErrors.push(err158);
                            }
                            errors++;
                          }
                          for (const key16 in data) {
                            if (!(key16 === "kind" || key16 === "baseRevision" || key16 === "reason" || key16 === "route" || key16 === "approvalRequest" || key16 === "memoryPatch")) {
                              const err159 = { instancePath, schemaPath: "#/anyOf/9/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key16 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err159];
                              } else {
                                vErrors.push(err159);
                              }
                              errors++;
                            }
                          }
                          if (data.kind !== void 0) {
                            let data82 = data.kind;
                            if (typeof data82 !== "string") {
                              const err160 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/9/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err160];
                              } else {
                                vErrors.push(err160);
                              }
                              errors++;
                            }
                            if ("run_plan_route_update" !== data82) {
                              const err161 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/9/properties/kind/const", keyword: "const", params: { allowedValue: "run_plan_route_update" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err161];
                              } else {
                                vErrors.push(err161);
                              }
                              errors++;
                            }
                          }
                          if (data.baseRevision !== void 0) {
                            let data83 = data.baseRevision;
                            if (!(typeof data83 == "number" && isFinite(data83))) {
                              const err162 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/anyOf/9/properties/baseRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                              if (vErrors === null) {
                                vErrors = [err162];
                              } else {
                                vErrors.push(err162);
                              }
                              errors++;
                            }
                          }
                          if (data.reason !== void 0) {
                            if (typeof data.reason !== "string") {
                              const err163 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/9/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err163];
                              } else {
                                vErrors.push(err163);
                              }
                              errors++;
                            }
                          }
                          if (data.route !== void 0) {
                            if (!validate49(data.route, { instancePath: instancePath + "/route", parentData: data, parentDataProperty: "route", rootData })) {
                              vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
                              errors = vErrors.length;
                            }
                          }
                          if (data.approvalRequest !== void 0) {
                            if (typeof data.approvalRequest !== "string") {
                              const err164 = { instancePath: instancePath + "/approvalRequest", schemaPath: "#/anyOf/9/properties/approvalRequest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err164];
                              } else {
                                vErrors.push(err164);
                              }
                              errors++;
                            }
                          }
                          if (data.memoryPatch !== void 0) {
                            if (!validate38(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
                              vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                              errors = vErrors.length;
                            }
                          }
                        } else {
                          const err165 = { instancePath, schemaPath: "#/anyOf/9/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err165];
                          } else {
                            vErrors.push(err165);
                          }
                          errors++;
                        }
                        var _valid0 = _errs203 === errors;
                        valid0 = valid0 || _valid0;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (!valid0) {
        const err166 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err166];
        } else {
          vErrors.push(err166);
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
      validate37.errors = vErrors;
      return errors === 0;
    }
    function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.action === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.observation === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "observation" }, message: "must have required property 'observation'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "action" || key0 === "observation")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if ("action" !== data0) {
            const err5 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "action" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.action !== void 0) {
          if (!validate29(data.action, { instancePath: instancePath + "/action", parentData: data, parentDataProperty: "action", rootData })) {
            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
            errors = vErrors.length;
          }
        }
        if (data.observation !== void 0) {
          if (!validate33(data.observation, { instancePath: instancePath + "/observation", parentData: data, parentDataProperty: "observation", rootData })) {
            vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs8 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err7 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (data.result === void 0) {
            const err8 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "result")) {
              const err9 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data3 = data.kind;
            if (typeof data3 !== "string") {
              const err10 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if ("decision" !== data3) {
              const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "decision" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          if (data.result !== void 0) {
            if (!validate37(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
              vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err12 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        var _valid0 = _errs8 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err13 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
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
      validate28.errors = vErrors;
      return errors === 0;
    }
    var schema48 = { "type": "object", "properties": { "action": { "$ref": "#/definitions/GoalSnapshotToolCallActionV1" }, "status": { "type": "string", "enum": ["approved", "awaiting_approval", "outcome_unknown"] }, "executionUnitId": { "type": "string", "description": "\u6682\u5B58\u8BE5 Action \u7684\u6267\u884C\u5355\u5143\uFF1B\u6062\u590D\u6267\u884C\u540E\u7EE7\u7EED\u4F7F\u7528\u540C\u4E00\u8EAB\u4EFD\u3002" }, "attemptsStarted": { "type": "number" }, "approvalScope": { "type": "string", "enum": ["action", "goal", "workspace"] }, "grantId": { "type": "string" }, "approvalKind": { "type": "string", "enum": ["tool", "sandbox"] }, "effectiveSandboxScope": { "type": "object", "properties": { "extraFiles": { "type": "array", "items": { "type": "object", "properties": { "canonicalPath": { "type": "string" }, "access": { "type": "string", "enum": ["read", "write"] }, "kind": { "type": "string", "enum": ["file", "directory_tree"] } }, "required": ["canonicalPath", "access", "kind"], "additionalProperties": false } }, "network": { "type": "string", "enum": ["none", "all_outbound"] } }, "required": ["extraFiles", "network"], "additionalProperties": false }, "approvalInputId": { "type": "string", "description": "\u6279\u51C6\u8BE5 Action \u7684\u7A33\u5B9A\u51B3\u5B9A\u8EAB\u4EFD\uFF1B\u6301\u7EED\u6388\u6743\u6309\u8BE5\u8EAB\u4EFD\u6682\u5B58\u4E0E\u6FC0\u6D3B\u3002" }, "executionVersion": { "$ref": "#/definitions/GoalSnapshotExecutionVersionV1", "description": "\u5DF2\u83B7\u6279 Action \u7684\u6700\u7EC8\u6267\u884C\u7248\u672C\uFF1B\u672A\u4FEE\u8BA2\u7684\u6279\u51C6\u7701\u7565\u3002" }, "recoveryRef": { "type": "string", "description": "\u7ED3\u679C\u672A\u77E5\u7B49\u5F85\u7684\u6062\u590D\u8EAB\u4EFD\uFF1B\u8DE8\u91CD\u542F\u7A33\u5B9A\u3002" } }, "required": ["action", "status"], "additionalProperties": false, "description": "Snapshot \u4E2D\u7684\u672A\u5B8C\u6210 Action\u3002" };
    var schema49 = { "type": "object", "properties": { "original": { "type": "object", "properties": { "actionId": { "type": "string" }, "toolId": { "type": "string" }, "input": { "$ref": "#/definitions/SnapshotJsonValue" } }, "required": ["actionId", "toolId", "input"], "additionalProperties": false, "description": "\u539F\u8BF7\u6C42\u7684\u7A33\u5B9A\u5F15\u7528\u4E0E\u539F\u59CB\u53C2\u6570\uFF1B\u4E0D\u88AB\u4FEE\u8BA2\u8986\u76D6\u3002" }, "input": { "$ref": "#/definitions/SnapshotJsonValue", "description": "\u6700\u7EC8 canonical \u6267\u884C\u53C2\u6570\u3002" }, "reviewRef": { "type": "string", "description": "\u7ED1\u5B9A\u7684\u5BA1\u9605\u6307\u7EB9\u3002" }, "scope": { "type": "string", "enum": ["action", "goal", "workspace"], "description": "\u5B9E\u9645\u83B7\u6279\u7684\u6388\u6743\u671F\u9650\u3002" }, "revision": { "type": "object", "properties": { "source": { "type": "string", "enum": ["user", "host"] } }, "required": ["source"], "additionalProperties": false, "description": "\u4FEE\u8BA2\u6765\u6E90\uFF1B\u672A\u4FEE\u8BA2\u7684\u6279\u51C6\u7701\u7565\u3002" } }, "required": ["original", "input", "reviewRef", "scope"], "additionalProperties": false, "description": "Snapshot \u4E2D\u5DF2\u83B7\u6279 Action \u7684\u6700\u7EC8\u6267\u884C\u7248\u672C\u3002" };
    function validate56(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.original === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "original" }, message: "must have required property 'original'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.input === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.reviewRef === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reviewRef" }, message: "must have required property 'reviewRef'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.scope === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "original" || key0 === "input" || key0 === "reviewRef" || key0 === "scope" || key0 === "revision")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.original !== void 0) {
          let data0 = data.original;
          if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
            if (data0.actionId === void 0) {
              const err5 = { instancePath: instancePath + "/original", schemaPath: "#/properties/original/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data0.toolId === void 0) {
              const err6 = { instancePath: instancePath + "/original", schemaPath: "#/properties/original/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data0.input === void 0) {
              const err7 = { instancePath: instancePath + "/original", schemaPath: "#/properties/original/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            for (const key1 in data0) {
              if (!(key1 === "actionId" || key1 === "toolId" || key1 === "input")) {
                const err8 = { instancePath: instancePath + "/original", schemaPath: "#/properties/original/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
            if (data0.actionId !== void 0) {
              if (typeof data0.actionId !== "string") {
                const err9 = { instancePath: instancePath + "/original/actionId", schemaPath: "#/properties/original/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            }
            if (data0.toolId !== void 0) {
              if (typeof data0.toolId !== "string") {
                const err10 = { instancePath: instancePath + "/original/toolId", schemaPath: "#/properties/original/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
            if (data0.input !== void 0) {
              if (!validate30(data0.input, { instancePath: instancePath + "/original/input", parentData: data0, parentDataProperty: "input", rootData })) {
                vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err11 = { instancePath: instancePath + "/original", schemaPath: "#/properties/original/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.input !== void 0) {
          if (!validate30(data.input, { instancePath: instancePath + "/input", parentData: data, parentDataProperty: "input", rootData })) {
            vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
            errors = vErrors.length;
          }
        }
        if (data.reviewRef !== void 0) {
          if (typeof data.reviewRef !== "string") {
            const err12 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/properties/reviewRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data6 = data.scope;
          if (typeof data6 !== "string") {
            const err13 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (!(data6 === "action" || data6 === "goal" || data6 === "workspace")) {
            const err14 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/enum", keyword: "enum", params: { allowedValues: schema49.properties.scope.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data7 = data.revision;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.source === void 0) {
              const err15 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key2 in data7) {
              if (!(key2 === "source")) {
                const err16 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data7.source !== void 0) {
              let data8 = data7.source;
              if (typeof data8 !== "string") {
                const err17 = { instancePath: instancePath + "/revision/source", schemaPath: "#/properties/revision/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
              if (!(data8 === "user" || data8 === "host")) {
                const err18 = { instancePath: instancePath + "/revision/source", schemaPath: "#/properties/revision/properties/source/enum", keyword: "enum", params: { allowedValues: schema49.properties.revision.properties.source.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
      validate56.errors = vErrors;
      return errors === 0;
    }
    function validate54(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.action === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema48.properties, key0)) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.action !== void 0) {
          if (!validate29(data.action, { instancePath: instancePath + "/action", parentData: data, parentDataProperty: "action", rootData })) {
            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
            errors = vErrors.length;
          }
        }
        if (data.status !== void 0) {
          let data1 = data.status;
          if (typeof data1 !== "string") {
            const err3 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (!(data1 === "approved" || data1 === "awaiting_approval" || data1 === "outcome_unknown")) {
            const err4 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema48.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          if (typeof data.executionUnitId !== "string") {
            const err5 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.attemptsStarted !== void 0) {
          let data3 = data.attemptsStarted;
          if (!(typeof data3 == "number" && isFinite(data3))) {
            const err6 = { instancePath: instancePath + "/attemptsStarted", schemaPath: "#/properties/attemptsStarted/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.approvalScope !== void 0) {
          let data4 = data.approvalScope;
          if (typeof data4 !== "string") {
            const err7 = { instancePath: instancePath + "/approvalScope", schemaPath: "#/properties/approvalScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data4 === "action" || data4 === "goal" || data4 === "workspace")) {
            const err8 = { instancePath: instancePath + "/approvalScope", schemaPath: "#/properties/approvalScope/enum", keyword: "enum", params: { allowedValues: schema48.properties.approvalScope.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.grantId !== void 0) {
          if (typeof data.grantId !== "string") {
            const err9 = { instancePath: instancePath + "/grantId", schemaPath: "#/properties/grantId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.approvalKind !== void 0) {
          let data6 = data.approvalKind;
          if (typeof data6 !== "string") {
            const err10 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/properties/approvalKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (!(data6 === "tool" || data6 === "sandbox")) {
            const err11 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/properties/approvalKind/enum", keyword: "enum", params: { allowedValues: schema48.properties.approvalKind.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.effectiveSandboxScope !== void 0) {
          let data7 = data.effectiveSandboxScope;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.extraFiles === void 0) {
              const err12 = { instancePath: instancePath + "/effectiveSandboxScope", schemaPath: "#/properties/effectiveSandboxScope/required", keyword: "required", params: { missingProperty: "extraFiles" }, message: "must have required property 'extraFiles'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data7.network === void 0) {
              const err13 = { instancePath: instancePath + "/effectiveSandboxScope", schemaPath: "#/properties/effectiveSandboxScope/required", keyword: "required", params: { missingProperty: "network" }, message: "must have required property 'network'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            for (const key1 in data7) {
              if (!(key1 === "extraFiles" || key1 === "network")) {
                const err14 = { instancePath: instancePath + "/effectiveSandboxScope", schemaPath: "#/properties/effectiveSandboxScope/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data7.extraFiles !== void 0) {
              let data8 = data7.extraFiles;
              if (Array.isArray(data8)) {
                const len0 = data8.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  let data9 = data8[i0];
                  if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                    if (data9.canonicalPath === void 0) {
                      const err15 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0, schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/required", keyword: "required", params: { missingProperty: "canonicalPath" }, message: "must have required property 'canonicalPath'" };
                      if (vErrors === null) {
                        vErrors = [err15];
                      } else {
                        vErrors.push(err15);
                      }
                      errors++;
                    }
                    if (data9.access === void 0) {
                      const err16 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0, schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                      if (vErrors === null) {
                        vErrors = [err16];
                      } else {
                        vErrors.push(err16);
                      }
                      errors++;
                    }
                    if (data9.kind === void 0) {
                      const err17 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0, schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err17];
                      } else {
                        vErrors.push(err17);
                      }
                      errors++;
                    }
                    for (const key2 in data9) {
                      if (!(key2 === "canonicalPath" || key2 === "access" || key2 === "kind")) {
                        const err18 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0, schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err18];
                        } else {
                          vErrors.push(err18);
                        }
                        errors++;
                      }
                    }
                    if (data9.canonicalPath !== void 0) {
                      if (typeof data9.canonicalPath !== "string") {
                        const err19 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/properties/canonicalPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err19];
                        } else {
                          vErrors.push(err19);
                        }
                        errors++;
                      }
                    }
                    if (data9.access !== void 0) {
                      let data11 = data9.access;
                      if (typeof data11 !== "string") {
                        const err20 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0 + "/access", schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err20];
                        } else {
                          vErrors.push(err20);
                        }
                        errors++;
                      }
                      if (!(data11 === "read" || data11 === "write")) {
                        const err21 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0 + "/access", schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/properties/access/enum", keyword: "enum", params: { allowedValues: schema48.properties.effectiveSandboxScope.properties.extraFiles.items.properties.access.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err21];
                        } else {
                          vErrors.push(err21);
                        }
                        errors++;
                      }
                    }
                    if (data9.kind !== void 0) {
                      let data12 = data9.kind;
                      if (typeof data12 !== "string") {
                        const err22 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0 + "/kind", schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err22];
                        } else {
                          vErrors.push(err22);
                        }
                        errors++;
                      }
                      if (!(data12 === "file" || data12 === "directory_tree")) {
                        const err23 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0 + "/kind", schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/properties/kind/enum", keyword: "enum", params: { allowedValues: schema48.properties.effectiveSandboxScope.properties.extraFiles.items.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err23];
                        } else {
                          vErrors.push(err23);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err24 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles/" + i0, schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                }
              } else {
                const err25 = { instancePath: instancePath + "/effectiveSandboxScope/extraFiles", schemaPath: "#/properties/effectiveSandboxScope/properties/extraFiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            }
            if (data7.network !== void 0) {
              let data13 = data7.network;
              if (typeof data13 !== "string") {
                const err26 = { instancePath: instancePath + "/effectiveSandboxScope/network", schemaPath: "#/properties/effectiveSandboxScope/properties/network/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              if (!(data13 === "none" || data13 === "all_outbound")) {
                const err27 = { instancePath: instancePath + "/effectiveSandboxScope/network", schemaPath: "#/properties/effectiveSandboxScope/properties/network/enum", keyword: "enum", params: { allowedValues: schema48.properties.effectiveSandboxScope.properties.network.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            }
          } else {
            const err28 = { instancePath: instancePath + "/effectiveSandboxScope", schemaPath: "#/properties/effectiveSandboxScope/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data.approvalInputId !== void 0) {
          if (typeof data.approvalInputId !== "string") {
            const err29 = { instancePath: instancePath + "/approvalInputId", schemaPath: "#/properties/approvalInputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data.executionVersion !== void 0) {
          if (!validate56(data.executionVersion, { instancePath: instancePath + "/executionVersion", parentData: data, parentDataProperty: "executionVersion", rootData })) {
            vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
            errors = vErrors.length;
          }
        }
        if (data.recoveryRef !== void 0) {
          if (typeof data.recoveryRef !== "string") {
            const err30 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
      } else {
        const err31 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
      validate54.errors = vErrors;
      return errors === 0;
    }
    function validate61(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.batchId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "batchId" }, message: "must have required property 'batchId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.remaining === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "remaining" }, message: "must have required property 'remaining'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "batchId" || key0 === "remaining")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.batchId !== void 0) {
          if (typeof data.batchId !== "string") {
            const err3 = { instancePath: instancePath + "/batchId", schemaPath: "#/properties/batchId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.remaining !== void 0) {
          let data1 = data.remaining;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate29(data1[i0], { instancePath: instancePath + "/remaining/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err4 = { instancePath: instancePath + "/remaining", schemaPath: "#/properties/remaining/type", keyword: "type", params: { type: "array" }, message: "must be array" };
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
      validate61.errors = vErrors;
      return errors === 0;
    }
    var schema51 = { "type": "object", "properties": { "programId": { "type": "string" }, "action": { "$ref": "#/definitions/GoalSnapshotToolCallActionV1" }, "executionUnitId": { "type": "string" }, "codeHash": { "type": "string" }, "workerHash": { "type": "string" }, "nodeVersion": { "type": "string" }, "fixedTime": { "type": "number" }, "seed": { "type": "number" }, "nextCallIndex": { "type": "number" }, "resultBytes": { "type": "number" }, "pendingStop": { "type": "object", "properties": { "code": { "type": "string" }, "message": { "type": "string" } }, "required": ["code", "message"], "additionalProperties": false } }, "required": ["programId", "action", "executionUnitId", "codeHash", "workerHash", "nodeVersion", "fixedTime", "seed", "nextCallIndex", "resultBytes"], "additionalProperties": false, "description": "\u5F53\u524D\u7A0B\u5E8F\u7684\u7236 Action \u4E0E\u6062\u590D\u8EAB\u4EFD\uFF1B\u4E2D\u95F4\u7ED3\u679C\u4ECD\u53EA\u5B58 Trajectory\u3002" };
    function validate64(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.programId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "programId" }, message: "must have required property 'programId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.action === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.executionUnitId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.codeHash === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "codeHash" }, message: "must have required property 'codeHash'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.workerHash === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "workerHash" }, message: "must have required property 'workerHash'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.nodeVersion === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nodeVersion" }, message: "must have required property 'nodeVersion'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.fixedTime === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "fixedTime" }, message: "must have required property 'fixedTime'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.seed === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "seed" }, message: "must have required property 'seed'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.nextCallIndex === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextCallIndex" }, message: "must have required property 'nextCallIndex'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.resultBytes === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resultBytes" }, message: "must have required property 'resultBytes'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema51.properties, key0)) {
            const err10 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.programId !== void 0) {
          if (typeof data.programId !== "string") {
            const err11 = { instancePath: instancePath + "/programId", schemaPath: "#/properties/programId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.action !== void 0) {
          if (!validate29(data.action, { instancePath: instancePath + "/action", parentData: data, parentDataProperty: "action", rootData })) {
            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
            errors = vErrors.length;
          }
        }
        if (data.executionUnitId !== void 0) {
          if (typeof data.executionUnitId !== "string") {
            const err12 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.codeHash !== void 0) {
          if (typeof data.codeHash !== "string") {
            const err13 = { instancePath: instancePath + "/codeHash", schemaPath: "#/properties/codeHash/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.workerHash !== void 0) {
          if (typeof data.workerHash !== "string") {
            const err14 = { instancePath: instancePath + "/workerHash", schemaPath: "#/properties/workerHash/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.nodeVersion !== void 0) {
          if (typeof data.nodeVersion !== "string") {
            const err15 = { instancePath: instancePath + "/nodeVersion", schemaPath: "#/properties/nodeVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.fixedTime !== void 0) {
          let data6 = data.fixedTime;
          if (!(typeof data6 == "number" && isFinite(data6))) {
            const err16 = { instancePath: instancePath + "/fixedTime", schemaPath: "#/properties/fixedTime/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.seed !== void 0) {
          let data7 = data.seed;
          if (!(typeof data7 == "number" && isFinite(data7))) {
            const err17 = { instancePath: instancePath + "/seed", schemaPath: "#/properties/seed/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.nextCallIndex !== void 0) {
          let data8 = data.nextCallIndex;
          if (!(typeof data8 == "number" && isFinite(data8))) {
            const err18 = { instancePath: instancePath + "/nextCallIndex", schemaPath: "#/properties/nextCallIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.resultBytes !== void 0) {
          let data9 = data.resultBytes;
          if (!(typeof data9 == "number" && isFinite(data9))) {
            const err19 = { instancePath: instancePath + "/resultBytes", schemaPath: "#/properties/resultBytes/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.pendingStop !== void 0) {
          let data10 = data.pendingStop;
          if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
            if (data10.code === void 0) {
              const err20 = { instancePath: instancePath + "/pendingStop", schemaPath: "#/properties/pendingStop/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data10.message === void 0) {
              const err21 = { instancePath: instancePath + "/pendingStop", schemaPath: "#/properties/pendingStop/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            for (const key1 in data10) {
              if (!(key1 === "code" || key1 === "message")) {
                const err22 = { instancePath: instancePath + "/pendingStop", schemaPath: "#/properties/pendingStop/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data10.code !== void 0) {
              if (typeof data10.code !== "string") {
                const err23 = { instancePath: instancePath + "/pendingStop/code", schemaPath: "#/properties/pendingStop/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data10.message !== void 0) {
              if (typeof data10.message !== "string") {
                const err24 = { instancePath: instancePath + "/pendingStop/message", schemaPath: "#/properties/pendingStop/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
          } else {
            const err25 = { instancePath: instancePath + "/pendingStop", schemaPath: "#/properties/pendingStop/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
      } else {
        const err26 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
      validate64.errors = vErrors;
      return errors === 0;
    }
    var schema53 = { "type": "object", "properties": { "kind": { "type": "string", "const": "ask_user" }, "requestId": { "type": "string" }, "mode": { "type": "string", "enum": ["plan", "execution"] }, "questions": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotAskUserQuestionV1" } }, "routeRevision": { "$ref": "#/definitions/GoalSnapshotPendingPlanRouteRevisionApprovalV1" } }, "required": ["kind", "requestId", "mode", "questions"], "additionalProperties": false, "description": "Snapshot \u4E2D\u6301\u4E45\u5316\u7B49\u5F85 AskUser \u95EE\u7B54\u5B8C\u6210\u7684\u6302\u8D77\u4EA4\u4E92\u3002" };
    function validate69(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.header === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "header" }, message: "must have required property 'header'" };
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
        if (data.options === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "options" }, message: "must have required property 'options'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.multiSelect === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "multiSelect" }, message: "must have required property 'multiSelect'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "header" || key0 === "question" || key0 === "options" || key0 === "multiSelect")) {
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
          if (typeof data.id !== "string") {
            const err6 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.header !== void 0) {
          if (typeof data.header !== "string") {
            const err7 = { instancePath: instancePath + "/header", schemaPath: "#/properties/header/type", keyword: "type", params: { type: "string" }, message: "must be string" };
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
        if (data.options !== void 0) {
          let data3 = data.options;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data4 = data3[i0];
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                if (data4.id === void 0) {
                  const err9 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/GoalSnapshotAskUserOptionV1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                if (data4.label === void 0) {
                  const err10 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/GoalSnapshotAskUserOptionV1/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
                for (const key1 in data4) {
                  if (!(key1 === "id" || key1 === "label" || key1 === "description")) {
                    const err11 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/GoalSnapshotAskUserOptionV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data4.id !== void 0) {
                  if (typeof data4.id !== "string") {
                    const err12 = { instancePath: instancePath + "/options/" + i0 + "/id", schemaPath: "#/definitions/GoalSnapshotAskUserOptionV1/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
                if (data4.label !== void 0) {
                  if (typeof data4.label !== "string") {
                    const err13 = { instancePath: instancePath + "/options/" + i0 + "/label", schemaPath: "#/definitions/GoalSnapshotAskUserOptionV1/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
                if (data4.description !== void 0) {
                  if (typeof data4.description !== "string") {
                    const err14 = { instancePath: instancePath + "/options/" + i0 + "/description", schemaPath: "#/definitions/GoalSnapshotAskUserOptionV1/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                }
              } else {
                const err15 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/GoalSnapshotAskUserOptionV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
          } else {
            const err16 = { instancePath: instancePath + "/options", schemaPath: "#/properties/options/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.multiSelect !== void 0) {
          if (typeof data.multiSelect !== "boolean") {
            const err17 = { instancePath: instancePath + "/multiSelect", schemaPath: "#/properties/multiSelect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
      } else {
        const err18 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      validate69.errors = vErrors;
      return errors === 0;
    }
    function validate71(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.baseRevision === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "baseRevision" }, message: "must have required property 'baseRevision'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.candidate === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "candidate" }, message: "must have required property 'candidate'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.reason === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.approvalRequest === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "approvalRequest" }, message: "must have required property 'approvalRequest'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.approvalOptionId === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "approvalOptionId" }, message: "must have required property 'approvalOptionId'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "baseRevision" || key0 === "candidate" || key0 === "reason" || key0 === "approvalRequest" || key0 === "approvalOptionId")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.baseRevision !== void 0) {
          let data0 = data.baseRevision;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err6 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/properties/baseRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.candidate !== void 0) {
          if (!validate49(data.candidate, { instancePath: instancePath + "/candidate", parentData: data, parentDataProperty: "candidate", rootData })) {
            vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
            errors = vErrors.length;
          }
        }
        if (data.reason !== void 0) {
          if (typeof data.reason !== "string") {
            const err7 = { instancePath: instancePath + "/reason", schemaPath: "#/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.approvalRequest !== void 0) {
          if (typeof data.approvalRequest !== "string") {
            const err8 = { instancePath: instancePath + "/approvalRequest", schemaPath: "#/properties/approvalRequest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.approvalOptionId !== void 0) {
          if (typeof data.approvalOptionId !== "string") {
            const err9 = { instancePath: instancePath + "/approvalOptionId", schemaPath: "#/properties/approvalOptionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
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
      validate71.errors = vErrors;
      return errors === 0;
    }
    function validate68(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.requestId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.mode === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.questions === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "questions" }, message: "must have required property 'questions'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "requestId" || key0 === "mode" || key0 === "questions" || key0 === "routeRevision")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err5 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if ("ask_user" !== data0) {
            const err6 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/const", keyword: "const", params: { allowedValue: "ask_user" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.requestId !== void 0) {
          if (typeof data.requestId !== "string") {
            const err7 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.mode !== void 0) {
          let data2 = data.mode;
          if (typeof data2 !== "string") {
            const err8 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data2 === "plan" || data2 === "execution")) {
            const err9 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema53.properties.mode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.questions !== void 0) {
          let data3 = data.questions;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate69(data3[i0], { instancePath: instancePath + "/questions/" + i0, parentData: data3, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate69.errors : vErrors.concat(validate69.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err10 = { instancePath: instancePath + "/questions", schemaPath: "#/properties/questions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.routeRevision !== void 0) {
          if (!validate71(data.routeRevision, { instancePath: instancePath + "/routeRevision", parentData: data, parentDataProperty: "routeRevision", rootData })) {
            vErrors = vErrors === null ? validate71.errors : vErrors.concat(validate71.errors);
            errors = vErrors.length;
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
      validate68.errors = vErrors;
      return errors === 0;
    }
    function validate75(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.requestId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.proposal === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "proposal" }, message: "must have required property 'proposal'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.planRouteCandidate === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "planRouteCandidate" }, message: "must have required property 'planRouteCandidate'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.approvalRequest === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "approvalRequest" }, message: "must have required property 'approvalRequest'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "requestId" || key0 === "proposal" || key0 === "planRouteCandidate" || key0 === "approvalRequest")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err6 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if ("task_approval" !== data0) {
            const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/const", keyword: "const", params: { allowedValue: "task_approval" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.requestId !== void 0) {
          if (typeof data.requestId !== "string") {
            const err8 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.proposal !== void 0) {
          if (!validate20(data.proposal, { instancePath: instancePath + "/proposal", parentData: data, parentDataProperty: "proposal", rootData })) {
            vErrors = vErrors === null ? validate20.errors : vErrors.concat(validate20.errors);
            errors = vErrors.length;
          }
        }
        if (data.planRouteCandidate !== void 0) {
          if (!validate49(data.planRouteCandidate, { instancePath: instancePath + "/planRouteCandidate", parentData: data, parentDataProperty: "planRouteCandidate", rootData })) {
            vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
            errors = vErrors.length;
          }
        }
        if (data.approvalRequest !== void 0) {
          if (typeof data.approvalRequest !== "string") {
            const err9 = { instancePath: instancePath + "/approvalRequest", schemaPath: "#/properties/approvalRequest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
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
      validate75.errors = vErrors;
      return errors === 0;
    }
    function validate67(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (!validate68(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate68.errors : vErrors.concat(validate68.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs2 = errors;
        if (!validate75(data, { instancePath, parentData, parentDataProperty, rootData })) {
          vErrors = vErrors === null ? validate75.errors : vErrors.concat(validate75.errors);
          errors = vErrors.length;
        }
        var _valid0 = _errs2 === errors;
        valid0 = valid0 || _valid0;
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
      validate67.errors = vErrors;
      return errors === 0;
    }
    var schema61 = { "type": "object", "properties": { "requestId": { "type": "string" }, "status": { "type": "string", "enum": ["requested", "finished"] }, "interruptedActions": { "type": "array", "items": { "$ref": "#/definitions/GoalSnapshotToolCallActionV1" } }, "outcomeUnknown": { "type": "boolean" } }, "required": ["requestId", "status"], "additionalProperties": false, "description": "Snapshot \u4E2D\u7684\u7528\u6237 Interrupt \u8BF7\u6C42\u53CA\u53D6\u6D88\u7ED3\u7B97\u72B6\u6001\u3002" };
    function validate80(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.requestId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "requestId" || key0 === "status" || key0 === "interruptedActions" || key0 === "outcomeUnknown")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.requestId !== void 0) {
          if (typeof data.requestId !== "string") {
            const err3 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data1 = data.status;
          if (typeof data1 !== "string") {
            const err4 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data1 === "requested" || data1 === "finished")) {
            const err5 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema61.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.interruptedActions !== void 0) {
          let data2 = data.interruptedActions;
          if (Array.isArray(data2)) {
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate29(data2[i0], { instancePath: instancePath + "/interruptedActions/" + i0, parentData: data2, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err6 = { instancePath: instancePath + "/interruptedActions", schemaPath: "#/properties/interruptedActions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.outcomeUnknown !== void 0) {
          if (typeof data.outcomeUnknown !== "boolean") {
            const err7 = { instancePath: instancePath + "/outcomeUnknown", schemaPath: "#/properties/outcomeUnknown/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      validate80.errors = vErrors;
      return errors === 0;
    }
    function validate19(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.mode === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.stepCount === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepCount" }, message: "must have required property 'stepCount'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.exposedToolIds === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "exposedToolIds" }, message: "must have required property 'exposedToolIds'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.committedThroughSequence === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.contextEpoch === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "contextEpoch" }, message: "must have required property 'contextEpoch'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema26.properties, key0)) {
            const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err8 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.mode !== void 0) {
          let data1 = data.mode;
          if (typeof data1 !== "string") {
            const err9 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (!(data1 === "normal" || data1 === "plan")) {
            const err10 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema26.properties.mode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.approvedTask !== void 0) {
          if (!validate20(data.approvedTask, { instancePath: instancePath + "/approvedTask", parentData: data, parentDataProperty: "approvedTask", rootData })) {
            vErrors = vErrors === null ? validate20.errors : vErrors.concat(validate20.errors);
            errors = vErrors.length;
          }
        }
        if (data.status !== void 0) {
          let data3 = data.status;
          if (typeof data3 !== "string") {
            const err11 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (!(data3 === "created" || data3 === "running" || data3 === "waiting" || data3 === "completed" || data3 === "failed" || data3 === "cancelled")) {
            const err12 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema26.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.stepCount !== void 0) {
          let data4 = data.stepCount;
          if (!(typeof data4 == "number" && isFinite(data4))) {
            const err13 = { instancePath: instancePath + "/stepCount", schemaPath: "#/properties/stepCount/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.exposedToolIds !== void 0) {
          let data5 = data.exposedToolIds;
          if (Array.isArray(data5)) {
            const len0 = data5.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data5[i0] !== "string") {
                const err14 = { instancePath: instancePath + "/exposedToolIds/" + i0, schemaPath: "#/properties/exposedToolIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
          } else {
            const err15 = { instancePath: instancePath + "/exposedToolIds", schemaPath: "#/properties/exposedToolIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.committedThroughSequence !== void 0) {
          let data7 = data.committedThroughSequence;
          if (!(typeof data7 == "number" && isFinite(data7))) {
            const err16 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.memoryRevision !== void 0) {
          let data8 = data.memoryRevision;
          if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
            if (data8.eventId === void 0) {
              const err17 = { instancePath: instancePath + "/memoryRevision", schemaPath: "#/definitions/GoalSnapshotMemoryRevisionV1/required", keyword: "required", params: { missingProperty: "eventId" }, message: "must have required property 'eventId'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data8.sequence === void 0) {
              const err18 = { instancePath: instancePath + "/memoryRevision", schemaPath: "#/definitions/GoalSnapshotMemoryRevisionV1/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            for (const key1 in data8) {
              if (!(key1 === "eventId" || key1 === "sequence")) {
                const err19 = { instancePath: instancePath + "/memoryRevision", schemaPath: "#/definitions/GoalSnapshotMemoryRevisionV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data8.eventId !== void 0) {
              if (typeof data8.eventId !== "string") {
                const err20 = { instancePath: instancePath + "/memoryRevision/eventId", schemaPath: "#/definitions/GoalSnapshotMemoryRevisionV1/properties/eventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data8.sequence !== void 0) {
              let data10 = data8.sequence;
              if (!(typeof data10 == "number" && isFinite(data10))) {
                const err21 = { instancePath: instancePath + "/memoryRevision/sequence", schemaPath: "#/definitions/GoalSnapshotMemoryRevisionV1/properties/sequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/memoryRevision", schemaPath: "#/definitions/GoalSnapshotMemoryRevisionV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.currentStage !== void 0) {
          if (!validate24(data.currentStage, { instancePath: instancePath + "/currentStage", parentData: data, parentDataProperty: "currentStage", rootData })) {
            vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
            errors = vErrors.length;
          }
        }
        if (data.planRoute !== void 0) {
          if (!validate26(data.planRoute, { instancePath: instancePath + "/planRoute", parentData: data, parentDataProperty: "planRoute", rootData })) {
            vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
            errors = vErrors.length;
          }
        }
        if (data.lastStep !== void 0) {
          if (!validate28(data.lastStep, { instancePath: instancePath + "/lastStep", parentData: data, parentDataProperty: "lastStep", rootData })) {
            vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingAction !== void 0) {
          if (!validate54(data.pendingAction, { instancePath: instancePath + "/pendingAction", parentData: data, parentDataProperty: "pendingAction", rootData })) {
            vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingActionBatch !== void 0) {
          if (!validate61(data.pendingActionBatch, { instancePath: instancePath + "/pendingActionBatch", parentData: data, parentDataProperty: "pendingActionBatch", rootData })) {
            vErrors = vErrors === null ? validate61.errors : vErrors.concat(validate61.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingProgram !== void 0) {
          if (!validate64(data.pendingProgram, { instancePath: instancePath + "/pendingProgram", parentData: data, parentDataProperty: "pendingProgram", rootData })) {
            vErrors = vErrors === null ? validate64.errors : vErrors.concat(validate64.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingInteraction !== void 0) {
          if (!validate67(data.pendingInteraction, { instancePath: instancePath + "/pendingInteraction", parentData: data, parentDataProperty: "pendingInteraction", rootData })) {
            vErrors = vErrors === null ? validate67.errors : vErrors.concat(validate67.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingThink !== void 0) {
          let data18 = data.pendingThink;
          if (data18 && typeof data18 == "object" && !Array.isArray(data18)) {
            if (data18.goalId === void 0) {
              const err23 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if (data18.runId === void 0) {
              const err24 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (data18.stepOrdinal === void 0) {
              const err25 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/required", keyword: "required", params: { missingProperty: "stepOrdinal" }, message: "must have required property 'stepOrdinal'" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            if (data18.executionUnitId === void 0) {
              const err26 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data18.inputBoundary === void 0) {
              const err27 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/required", keyword: "required", params: { missingProperty: "inputBoundary" }, message: "must have required property 'inputBoundary'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data18.latestThinkEventId === void 0) {
              const err28 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/required", keyword: "required", params: { missingProperty: "latestThinkEventId" }, message: "must have required property 'latestThinkEventId'" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            for (const key2 in data18) {
              if (!(key2 === "goalId" || key2 === "runId" || key2 === "stepOrdinal" || key2 === "executionUnitId" || key2 === "inputBoundary" || key2 === "latestThinkEventId")) {
                const err29 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data18.goalId !== void 0) {
              if (typeof data18.goalId !== "string") {
                const err30 = { instancePath: instancePath + "/pendingThink/goalId", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data18.runId !== void 0) {
              if (typeof data18.runId !== "string") {
                const err31 = { instancePath: instancePath + "/pendingThink/runId", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data18.stepOrdinal !== void 0) {
              let data21 = data18.stepOrdinal;
              if (!(typeof data21 == "number" && isFinite(data21))) {
                const err32 = { instancePath: instancePath + "/pendingThink/stepOrdinal", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/properties/stepOrdinal/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
            if (data18.executionUnitId !== void 0) {
              if (typeof data18.executionUnitId !== "string") {
                const err33 = { instancePath: instancePath + "/pendingThink/executionUnitId", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
            if (data18.inputBoundary !== void 0) {
              if (typeof data18.inputBoundary !== "string") {
                const err34 = { instancePath: instancePath + "/pendingThink/inputBoundary", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/properties/inputBoundary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
            }
            if (data18.latestThinkEventId !== void 0) {
              if (typeof data18.latestThinkEventId !== "string") {
                const err35 = { instancePath: instancePath + "/pendingThink/latestThinkEventId", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/properties/latestThinkEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            }
          } else {
            const err36 = { instancePath: instancePath + "/pendingThink", schemaPath: "#/definitions/GoalSnapshotPendingThinkV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
        if (data.pendingModelRepair !== void 0) {
          let data25 = data.pendingModelRepair;
          if (data25 && typeof data25 == "object" && !Array.isArray(data25)) {
            if (data25.goalId === void 0) {
              const err37 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data25.runId === void 0) {
              const err38 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data25.stepOrdinal === void 0) {
              const err39 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "stepOrdinal" }, message: "must have required property 'stepOrdinal'" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            if (data25.executionUnitId === void 0) {
              const err40 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
              if (vErrors === null) {
                vErrors = [err40];
              } else {
                vErrors.push(err40);
              }
              errors++;
            }
            if (data25.stage === void 0) {
              const err41 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "stage" }, message: "must have required property 'stage'" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
            if (data25.inputBoundary === void 0) {
              const err42 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "inputBoundary" }, message: "must have required property 'inputBoundary'" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
            if (data25.attemptsStarted === void 0) {
              const err43 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "attemptsStarted" }, message: "must have required property 'attemptsStarted'" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (data25.latestAttemptEventId === void 0) {
              const err44 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/required", keyword: "required", params: { missingProperty: "latestAttemptEventId" }, message: "must have required property 'latestAttemptEventId'" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
            for (const key3 in data25) {
              if (!func2.call(schema59.properties, key3)) {
                const err45 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data25.goalId !== void 0) {
              if (typeof data25.goalId !== "string") {
                const err46 = { instancePath: instancePath + "/pendingModelRepair/goalId", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data25.runId !== void 0) {
              if (typeof data25.runId !== "string") {
                const err47 = { instancePath: instancePath + "/pendingModelRepair/runId", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
            if (data25.stepOrdinal !== void 0) {
              let data28 = data25.stepOrdinal;
              if (!(typeof data28 == "number" && isFinite(data28))) {
                const err48 = { instancePath: instancePath + "/pendingModelRepair/stepOrdinal", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/stepOrdinal/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
            if (data25.executionUnitId !== void 0) {
              if (typeof data25.executionUnitId !== "string") {
                const err49 = { instancePath: instancePath + "/pendingModelRepair/executionUnitId", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
            }
            if (data25.stage !== void 0) {
              let data30 = data25.stage;
              if (typeof data30 !== "string") {
                const err50 = { instancePath: instancePath + "/pendingModelRepair/stage", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/stage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (!(data30 === "decide" || data30 === "think")) {
                const err51 = { instancePath: instancePath + "/pendingModelRepair/stage", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/stage/enum", keyword: "enum", params: { allowedValues: schema59.properties.stage.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
            if (data25.inputBoundary !== void 0) {
              if (typeof data25.inputBoundary !== "string") {
                const err52 = { instancePath: instancePath + "/pendingModelRepair/inputBoundary", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/inputBoundary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              }
            }
            if (data25.attemptsStarted !== void 0) {
              let data32 = data25.attemptsStarted;
              if (!(typeof data32 == "number" && isFinite(data32))) {
                const err53 = { instancePath: instancePath + "/pendingModelRepair/attemptsStarted", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/attemptsStarted/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err53];
                } else {
                  vErrors.push(err53);
                }
                errors++;
              }
            }
            if (data25.continuationsStarted !== void 0) {
              let data33 = data25.continuationsStarted;
              if (!(typeof data33 == "number" && isFinite(data33))) {
                const err54 = { instancePath: instancePath + "/pendingModelRepair/continuationsStarted", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/continuationsStarted/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            }
            if (data25.latestFailureClass !== void 0) {
              let data34 = data25.latestFailureClass;
              if (typeof data34 !== "string") {
                const err55 = { instancePath: instancePath + "/pendingModelRepair/latestFailureClass", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/latestFailureClass/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
              if (!(data34 === "non_advancing" || data34 === "protocol")) {
                const err56 = { instancePath: instancePath + "/pendingModelRepair/latestFailureClass", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/latestFailureClass/enum", keyword: "enum", params: { allowedValues: schema59.properties.latestFailureClass.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            }
            if (data25.latestAttemptEventId !== void 0) {
              if (typeof data25.latestAttemptEventId !== "string") {
                const err57 = { instancePath: instancePath + "/pendingModelRepair/latestAttemptEventId", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/latestAttemptEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
            }
            if (data25.latestFeedbackEventId !== void 0) {
              if (typeof data25.latestFeedbackEventId !== "string") {
                const err58 = { instancePath: instancePath + "/pendingModelRepair/latestFeedbackEventId", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/latestFeedbackEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
            }
            if (data25.thinkRequestId !== void 0) {
              if (typeof data25.thinkRequestId !== "string") {
                const err59 = { instancePath: instancePath + "/pendingModelRepair/thinkRequestId", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/properties/thinkRequestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
            }
          } else {
            const err60 = { instancePath: instancePath + "/pendingModelRepair", schemaPath: "#/definitions/GoalSnapshotPendingModelRepairV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err60];
            } else {
              vErrors.push(err60);
            }
            errors++;
          }
        }
        if (data.steerInputs !== void 0) {
          let data38 = data.steerInputs;
          if (Array.isArray(data38)) {
            const len1 = data38.length;
            for (let i1 = 0; i1 < len1; i1++) {
              let data39 = data38[i1];
              const _errs80 = errors;
              let valid12 = false;
              const _errs81 = errors;
              if (data39 && typeof data39 == "object" && !Array.isArray(data39)) {
                if (data39.messageId === void 0) {
                  const err61 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
                  if (vErrors === null) {
                    vErrors = [err61];
                  } else {
                    vErrors.push(err61);
                  }
                  errors++;
                }
                if (data39.status === void 0) {
                  const err62 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err62];
                  } else {
                    vErrors.push(err62);
                  }
                  errors++;
                }
                if (data39.content === void 0) {
                  const err63 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err63];
                  } else {
                    vErrors.push(err63);
                  }
                  errors++;
                }
                for (const key4 in data39) {
                  if (!(key4 === "messageId" || key4 === "status" || key4 === "content")) {
                    const err64 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err64];
                    } else {
                      vErrors.push(err64);
                    }
                    errors++;
                  }
                }
                if (data39.messageId !== void 0) {
                  if (typeof data39.messageId !== "string") {
                    const err65 = { instancePath: instancePath + "/steerInputs/" + i1 + "/messageId", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err65];
                    } else {
                      vErrors.push(err65);
                    }
                    errors++;
                  }
                }
                if (data39.status !== void 0) {
                  let data41 = data39.status;
                  if (typeof data41 !== "string") {
                    const err66 = { instancePath: instancePath + "/steerInputs/" + i1 + "/status", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err66];
                    } else {
                      vErrors.push(err66);
                    }
                    errors++;
                  }
                  if ("pending" !== data41) {
                    const err67 = { instancePath: instancePath + "/steerInputs/" + i1 + "/status", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/properties/status/const", keyword: "const", params: { allowedValue: "pending" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err67];
                    } else {
                      vErrors.push(err67);
                    }
                    errors++;
                  }
                }
                if (data39.content !== void 0) {
                  if (typeof data39.content !== "string") {
                    const err68 = { instancePath: instancePath + "/steerInputs/" + i1 + "/content", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err68];
                    } else {
                      vErrors.push(err68);
                    }
                    errors++;
                  }
                }
              } else {
                const err69 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err69];
                } else {
                  vErrors.push(err69);
                }
                errors++;
              }
              var _valid0 = _errs81 === errors;
              valid12 = valid12 || _valid0;
              if (!valid12) {
                const _errs90 = errors;
                if (data39 && typeof data39 == "object" && !Array.isArray(data39)) {
                  if (data39.messageId === void 0) {
                    const err70 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
                    if (vErrors === null) {
                      vErrors = [err70];
                    } else {
                      vErrors.push(err70);
                    }
                    errors++;
                  }
                  if (data39.status === void 0) {
                    const err71 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                  if (data39.messageIndex === void 0) {
                    const err72 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/required", keyword: "required", params: { missingProperty: "messageIndex" }, message: "must have required property 'messageIndex'" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                  for (const key5 in data39) {
                    if (!(key5 === "messageId" || key5 === "status" || key5 === "messageIndex")) {
                      const err73 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err73];
                      } else {
                        vErrors.push(err73);
                      }
                      errors++;
                    }
                  }
                  if (data39.messageId !== void 0) {
                    if (typeof data39.messageId !== "string") {
                      const err74 = { instancePath: instancePath + "/steerInputs/" + i1 + "/messageId", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err74];
                      } else {
                        vErrors.push(err74);
                      }
                      errors++;
                    }
                  }
                  if (data39.status !== void 0) {
                    let data44 = data39.status;
                    if (typeof data44 !== "string") {
                      const err75 = { instancePath: instancePath + "/steerInputs/" + i1 + "/status", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err75];
                      } else {
                        vErrors.push(err75);
                      }
                      errors++;
                    }
                    if ("applied" !== data44) {
                      const err76 = { instancePath: instancePath + "/steerInputs/" + i1 + "/status", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/properties/status/const", keyword: "const", params: { allowedValue: "applied" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err76];
                      } else {
                        vErrors.push(err76);
                      }
                      errors++;
                    }
                  }
                  if (data39.messageIndex !== void 0) {
                    let data45 = data39.messageIndex;
                    if (!(typeof data45 == "number" && isFinite(data45))) {
                      const err77 = { instancePath: instancePath + "/steerInputs/" + i1 + "/messageIndex", schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/properties/messageIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                      if (vErrors === null) {
                        vErrors = [err77];
                      } else {
                        vErrors.push(err77);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err78 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err78];
                  } else {
                    vErrors.push(err78);
                  }
                  errors++;
                }
                var _valid0 = _errs90 === errors;
                valid12 = valid12 || _valid0;
              }
              if (!valid12) {
                const err79 = { instancePath: instancePath + "/steerInputs/" + i1, schemaPath: "#/definitions/GoalSnapshotSteerInputV1/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err79];
                } else {
                  vErrors.push(err79);
                }
                errors++;
              } else {
                errors = _errs80;
                if (vErrors !== null) {
                  if (_errs80) {
                    vErrors.length = _errs80;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err80 = { instancePath: instancePath + "/steerInputs", schemaPath: "#/properties/steerInputs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err80];
            } else {
              vErrors.push(err80);
            }
            errors++;
          }
        }
        if (data.interruption !== void 0) {
          if (!validate80(data.interruption, { instancePath: instancePath + "/interruption", parentData: data, parentDataProperty: "interruption", rootData })) {
            vErrors = vErrors === null ? validate80.errors : vErrors.concat(validate80.errors);
            errors = vErrors.length;
          }
        }
        if (data.stopReason !== void 0) {
          let data47 = data.stopReason;
          const _errs102 = errors;
          let valid16 = false;
          const _errs103 = errors;
          if (data47 && typeof data47 == "object" && !Array.isArray(data47)) {
            if (data47.kind === void 0) {
              const err81 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err81];
              } else {
                vErrors.push(err81);
              }
              errors++;
            }
            for (const key6 in data47) {
              if (!(key6 === "kind")) {
                const err82 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err82];
                } else {
                  vErrors.push(err82);
                }
                errors++;
              }
            }
            if (data47.kind !== void 0) {
              let data48 = data47.kind;
              if (typeof data48 !== "string") {
                const err83 = { instancePath: instancePath + "/stopReason/kind", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err83];
                } else {
                  vErrors.push(err83);
                }
                errors++;
              }
              if ("max_steps_exceeded" !== data48) {
                const err84 = { instancePath: instancePath + "/stopReason/kind", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "max_steps_exceeded" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err84];
                } else {
                  vErrors.push(err84);
                }
                errors++;
              }
            }
          } else {
            const err85 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err85];
            } else {
              vErrors.push(err85);
            }
            errors++;
          }
          var _valid1 = _errs103 === errors;
          valid16 = valid16 || _valid1;
          if (!valid16) {
            const _errs108 = errors;
            if (data47 && typeof data47 == "object" && !Array.isArray(data47)) {
              if (data47.kind === void 0) {
                const err86 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err86];
                } else {
                  vErrors.push(err86);
                }
                errors++;
              }
              if (data47.code === void 0) {
                const err87 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
                if (vErrors === null) {
                  vErrors = [err87];
                } else {
                  vErrors.push(err87);
                }
                errors++;
              }
              if (data47.message === void 0) {
                const err88 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
                if (vErrors === null) {
                  vErrors = [err88];
                } else {
                  vErrors.push(err88);
                }
                errors++;
              }
              for (const key7 in data47) {
                if (!(key7 === "kind" || key7 === "code" || key7 === "message")) {
                  const err89 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err89];
                  } else {
                    vErrors.push(err89);
                  }
                  errors++;
                }
              }
              if (data47.kind !== void 0) {
                let data49 = data47.kind;
                if (typeof data49 !== "string") {
                  const err90 = { instancePath: instancePath + "/stopReason/kind", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err90];
                  } else {
                    vErrors.push(err90);
                  }
                  errors++;
                }
                if ("execution_error" !== data49) {
                  const err91 = { instancePath: instancePath + "/stopReason/kind", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "execution_error" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err91];
                  } else {
                    vErrors.push(err91);
                  }
                  errors++;
                }
              }
              if (data47.code !== void 0) {
                let data50 = data47.code;
                if (typeof data50 !== "string") {
                  const err92 = { instancePath: instancePath + "/stopReason/code", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err92];
                  } else {
                    vErrors.push(err92);
                  }
                  errors++;
                }
                if (!(data50 === "TOOL_NOT_AUTHORIZED" || data50 === "TOOL_NOT_FOUND" || data50 === "INVALID_TOOL_INPUT" || data50 === "INVALID_MEMORY_PATCH" || data50 === "INVALID_AGENT_DECISION" || data50 === "COMPLETION_REVIEW_INPUT_TOO_LARGE" || data50 === "MODEL_REQUEST_FAILED" || data50 === "TOOL_EXECUTION_ERROR")) {
                  const err93 = { instancePath: instancePath + "/stopReason/code", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/properties/code/enum", keyword: "enum", params: { allowedValues: schema62.anyOf[1].properties.code.enum }, message: "must be equal to one of the allowed values" };
                  if (vErrors === null) {
                    vErrors = [err93];
                  } else {
                    vErrors.push(err93);
                  }
                  errors++;
                }
              }
              if (data47.message !== void 0) {
                if (typeof data47.message !== "string") {
                  const err94 = { instancePath: instancePath + "/stopReason/message", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err94];
                  } else {
                    vErrors.push(err94);
                  }
                  errors++;
                }
              }
            } else {
              const err95 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err95];
              } else {
                vErrors.push(err95);
              }
              errors++;
            }
            var _valid1 = _errs108 === errors;
            valid16 = valid16 || _valid1;
          }
          if (!valid16) {
            const err96 = { instancePath: instancePath + "/stopReason", schemaPath: "#/definitions/GoalSnapshotStopReasonV1/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err96];
            } else {
              vErrors.push(err96);
            }
            errors++;
          } else {
            errors = _errs102;
            if (vErrors !== null) {
              if (_errs102) {
                vErrors.length = _errs102;
              } else {
                vErrors = null;
              }
            }
          }
        }
        if (data.contextEpoch !== void 0) {
          let data52 = data.contextEpoch;
          if (data52 && typeof data52 == "object" && !Array.isArray(data52)) {
            if (data52.version === void 0) {
              const err97 = { instancePath: instancePath + "/contextEpoch", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
              if (vErrors === null) {
                vErrors = [err97];
              } else {
                vErrors.push(err97);
              }
              errors++;
            }
            if (data52.number === void 0) {
              const err98 = { instancePath: instancePath + "/contextEpoch", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/required", keyword: "required", params: { missingProperty: "number" }, message: "must have required property 'number'" };
              if (vErrors === null) {
                vErrors = [err98];
              } else {
                vErrors.push(err98);
              }
              errors++;
            }
            if (data52.conversationStartIndex === void 0) {
              const err99 = { instancePath: instancePath + "/contextEpoch", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/required", keyword: "required", params: { missingProperty: "conversationStartIndex" }, message: "must have required property 'conversationStartIndex'" };
              if (vErrors === null) {
                vErrors = [err99];
              } else {
                vErrors.push(err99);
              }
              errors++;
            }
            if (data52.openedAtSequence === void 0) {
              const err100 = { instancePath: instancePath + "/contextEpoch", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/required", keyword: "required", params: { missingProperty: "openedAtSequence" }, message: "must have required property 'openedAtSequence'" };
              if (vErrors === null) {
                vErrors = [err100];
              } else {
                vErrors.push(err100);
              }
              errors++;
            }
            for (const key8 in data52) {
              if (!(key8 === "version" || key8 === "number" || key8 === "conversationStartIndex" || key8 === "openedAtSequence")) {
                const err101 = { instancePath: instancePath + "/contextEpoch", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err101];
                } else {
                  vErrors.push(err101);
                }
                errors++;
              }
            }
            if (data52.version !== void 0) {
              let data53 = data52.version;
              if (!(typeof data53 == "number" && isFinite(data53))) {
                const err102 = { instancePath: instancePath + "/contextEpoch/version", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err102];
                } else {
                  vErrors.push(err102);
                }
                errors++;
              }
              if (1 !== data53) {
                const err103 = { instancePath: instancePath + "/contextEpoch/version", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err103];
                } else {
                  vErrors.push(err103);
                }
                errors++;
              }
            }
            if (data52.number !== void 0) {
              let data54 = data52.number;
              if (!(typeof data54 == "number" && isFinite(data54))) {
                const err104 = { instancePath: instancePath + "/contextEpoch/number", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/properties/number/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err104];
                } else {
                  vErrors.push(err104);
                }
                errors++;
              }
            }
            if (data52.conversationStartIndex !== void 0) {
              let data55 = data52.conversationStartIndex;
              if (!(typeof data55 == "number" && isFinite(data55))) {
                const err105 = { instancePath: instancePath + "/contextEpoch/conversationStartIndex", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/properties/conversationStartIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err105];
                } else {
                  vErrors.push(err105);
                }
                errors++;
              }
            }
            if (data52.openedAtSequence !== void 0) {
              let data56 = data52.openedAtSequence;
              if (!(typeof data56 == "number" && isFinite(data56))) {
                const err106 = { instancePath: instancePath + "/contextEpoch/openedAtSequence", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/properties/openedAtSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err106];
                } else {
                  vErrors.push(err106);
                }
                errors++;
              }
            }
          } else {
            const err107 = { instancePath: instancePath + "/contextEpoch", schemaPath: "#/definitions/GoalSnapshotContextEpochV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err107];
            } else {
              vErrors.push(err107);
            }
            errors++;
          }
        }
      } else {
        const err108 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err108];
        } else {
          vErrors.push(err108);
        }
        errors++;
      }
      validate19.errors = vErrors;
      return errors === 0;
    }
    var schema66 = { "type": "object", "properties": { "id": { "type": "string" }, "content": { "type": "string" }, "position": { "type": "number" }, "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] } }, "required": ["id", "content", "position", "status"], "additionalProperties": false, "description": "Snapshot \u4E2D\u7684 GoalPlan Todo\u3002" };
    function validate84(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
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
                  const err4 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (data2.content === void 0) {
                  const err5 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                if (data2.position === void 0) {
                  const err6 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                if (data2.status === void 0) {
                  const err7 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!(key1 === "id" || key1 === "content" || key1 === "position" || key1 === "status")) {
                    const err8 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err8];
                    } else {
                      vErrors.push(err8);
                    }
                    errors++;
                  }
                }
                if (data2.id !== void 0) {
                  if (typeof data2.id !== "string") {
                    const err9 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data2.content !== void 0) {
                  if (typeof data2.content !== "string") {
                    const err10 = { instancePath: instancePath + "/items/" + i0 + "/content", schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                }
                if (data2.position !== void 0) {
                  let data5 = data2.position;
                  if (!(typeof data5 == "number" && isFinite(data5))) {
                    const err11 = { instancePath: instancePath + "/items/" + i0 + "/position", schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/properties/position/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data2.status !== void 0) {
                  let data6 = data2.status;
                  if (typeof data6 !== "string") {
                    const err12 = { instancePath: instancePath + "/items/" + i0 + "/status", schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                  if (!(data6 === "pending" || data6 === "in_progress" || data6 === "completed" || data6 === "cancelled")) {
                    const err13 = { instancePath: instancePath + "/items/" + i0 + "/status", schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/properties/status/enum", keyword: "enum", params: { allowedValues: schema66.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
              } else {
                const err14 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/GoalSnapshotGoalPlanItemV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
          } else {
            const err15 = { instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      validate84.errors = vErrors;
      return errors === 0;
    }
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.workflow === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "workflow" }, message: "must have required property 'workflow'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.messages === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messages" }, message: "must have required property 'messages'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.run === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "run" }, message: "must have required property 'run'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.modelSelection === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "modelSelection" }, message: "must have required property 'modelSelection'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.completedRuns === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "completedRuns" }, message: "must have required property 'completedRuns'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema16.properties, key0)) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.nextRunMode !== void 0) {
          let data0 = data.nextRunMode;
          if (typeof data0 !== "string") {
            const err6 = { instancePath: instancePath + "/nextRunMode", schemaPath: "#/properties/nextRunMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if ("plan" !== data0) {
            const err7 = { instancePath: instancePath + "/nextRunMode", schemaPath: "#/properties/nextRunMode/const", keyword: "const", params: { allowedValue: "plan" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.commitRevision !== void 0) {
          let data1 = data.commitRevision;
          if (!(typeof data1 == "number" && isFinite(data1))) {
            const err8 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/properties/commitRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.inputLedger !== void 0) {
          let data2 = data.inputLedger;
          if (Array.isArray(data2)) {
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data3 = data2[i0];
              if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                if (data3.inputId === void 0) {
                  const err9 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
                if (data3.kind === void 0) {
                  const err10 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
                if (data3.digest === void 0) {
                  const err11 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/required", keyword: "required", params: { missingProperty: "digest" }, message: "must have required property 'digest'" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                if (data3.sequence === void 0) {
                  const err12 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                if (data3.status === void 0) {
                  const err13 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (data3.admittedAtRevision === void 0) {
                  const err14 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/required", keyword: "required", params: { missingProperty: "admittedAtRevision" }, message: "must have required property 'admittedAtRevision'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                for (const key1 in data3) {
                  if (!func2.call(schema17.properties, key1)) {
                    const err15 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data3.inputId !== void 0) {
                  if (typeof data3.inputId !== "string") {
                    const err16 = { instancePath: instancePath + "/inputLedger/" + i0 + "/inputId", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
                if (data3.kind !== void 0) {
                  let data5 = data3.kind;
                  if (typeof data5 !== "string") {
                    const err17 = { instancePath: instancePath + "/inputLedger/" + i0 + "/kind", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                  if (!(data5 === "message" || data5 === "steer" || data5 === "interrupt" || data5 === "respond" || data5 === "resume" || data5 === "queue_control")) {
                    const err18 = { instancePath: instancePath + "/inputLedger/" + i0 + "/kind", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/kind/enum", keyword: "enum", params: { allowedValues: schema17.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                }
                if (data3.digest !== void 0) {
                  if (typeof data3.digest !== "string") {
                    const err19 = { instancePath: instancePath + "/inputLedger/" + i0 + "/digest", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/digest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data3.sequence !== void 0) {
                  let data7 = data3.sequence;
                  if (!(typeof data7 == "number" && isFinite(data7))) {
                    const err20 = { instancePath: instancePath + "/inputLedger/" + i0 + "/sequence", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/sequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                }
                if (data3.status !== void 0) {
                  let data8 = data3.status;
                  if (typeof data8 !== "string") {
                    const err21 = { instancePath: instancePath + "/inputLedger/" + i0 + "/status", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                  if (!(data8 === "pending" || data8 === "applied" || data8 === "cleared")) {
                    const err22 = { instancePath: instancePath + "/inputLedger/" + i0 + "/status", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/status/enum", keyword: "enum", params: { allowedValues: schema17.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                }
                if (data3.admittedAtRevision !== void 0) {
                  let data9 = data3.admittedAtRevision;
                  if (!(typeof data9 == "number" && isFinite(data9))) {
                    const err23 = { instancePath: instancePath + "/inputLedger/" + i0 + "/admittedAtRevision", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/admittedAtRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                }
                if (data3.targetRunId !== void 0) {
                  if (typeof data3.targetRunId !== "string") {
                    const err24 = { instancePath: instancePath + "/inputLedger/" + i0 + "/targetRunId", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/targetRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                }
                if (data3.appliedRunId !== void 0) {
                  if (typeof data3.appliedRunId !== "string") {
                    const err25 = { instancePath: instancePath + "/inputLedger/" + i0 + "/appliedRunId", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/appliedRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                }
                if (data3.messageIndex !== void 0) {
                  let data12 = data3.messageIndex;
                  if (!(typeof data12 == "number" && isFinite(data12))) {
                    const err26 = { instancePath: instancePath + "/inputLedger/" + i0 + "/messageIndex", schemaPath: "#/definitions/GoalSnapshotSessionInputV1/properties/messageIndex/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                }
              } else {
                const err27 = { instancePath: instancePath + "/inputLedger/" + i0, schemaPath: "#/definitions/GoalSnapshotSessionInputV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            }
          } else {
            const err28 = { instancePath: instancePath + "/inputLedger", schemaPath: "#/properties/inputLedger/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data.messageQueue !== void 0) {
          if (!validate15(data.messageQueue, { instancePath: instancePath + "/messageQueue", parentData: data, parentDataProperty: "messageQueue", rootData })) {
            vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
            errors = vErrors.length;
          }
        }
        if (data.workflow !== void 0) {
          let data14 = data.workflow;
          if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
            if (data14.phase === void 0) {
              const err29 = { instancePath: instancePath + "/workflow", schemaPath: "#/definitions/GoalSnapshotWorkflowV1/required", keyword: "required", params: { missingProperty: "phase" }, message: "must have required property 'phase'" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
            for (const key2 in data14) {
              if (!(key2 === "phase")) {
                const err30 = { instancePath: instancePath + "/workflow", schemaPath: "#/definitions/GoalSnapshotWorkflowV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data14.phase !== void 0) {
              let data15 = data14.phase;
              if (typeof data15 !== "string") {
                const err31 = { instancePath: instancePath + "/workflow/phase", schemaPath: "#/definitions/GoalSnapshotWorkflowV1/properties/phase/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
              if ("executing" !== data15) {
                const err32 = { instancePath: instancePath + "/workflow/phase", schemaPath: "#/definitions/GoalSnapshotWorkflowV1/properties/phase/const", keyword: "const", params: { allowedValue: "executing" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
          } else {
            const err33 = { instancePath: instancePath + "/workflow", schemaPath: "#/definitions/GoalSnapshotWorkflowV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data.messages !== void 0) {
          let data16 = data.messages;
          if (Array.isArray(data16)) {
            const len1 = data16.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (!validate17(data16[i1], { instancePath: instancePath + "/messages/" + i1, parentData: data16, parentDataProperty: i1, rootData })) {
                vErrors = vErrors === null ? validate17.errors : vErrors.concat(validate17.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err34 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data.run !== void 0) {
          if (!validate19(data.run, { instancePath: instancePath + "/run", parentData: data, parentDataProperty: "run", rootData })) {
            vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
            errors = vErrors.length;
          }
        }
        if (data.modelSelection !== void 0) {
          let data19 = data.modelSelection;
          if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
            if (data19.provider === void 0) {
              const err35 = { instancePath: instancePath + "/modelSelection", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            if (data19.modelId === void 0) {
              const err36 = { instancePath: instancePath + "/modelSelection", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/required", keyword: "required", params: { missingProperty: "modelId" }, message: "must have required property 'modelId'" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data19.inputEstimator === void 0) {
              const err37 = { instancePath: instancePath + "/modelSelection", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/required", keyword: "required", params: { missingProperty: "inputEstimator" }, message: "must have required property 'inputEstimator'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            for (const key3 in data19) {
              if (!func2.call(schema64.properties, key3)) {
                const err38 = { instancePath: instancePath + "/modelSelection", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
            if (data19.provider !== void 0) {
              if (typeof data19.provider !== "string") {
                const err39 = { instancePath: instancePath + "/modelSelection/provider", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data19.profileId !== void 0) {
              if (typeof data19.profileId !== "string") {
                const err40 = { instancePath: instancePath + "/modelSelection/profileId", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/profileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data19.modelId !== void 0) {
              if (typeof data19.modelId !== "string") {
                const err41 = { instancePath: instancePath + "/modelSelection/modelId", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
            if (data19.executionApi !== void 0) {
              let data23 = data19.executionApi;
              if (typeof data23 !== "string") {
                const err42 = { instancePath: instancePath + "/modelSelection/executionApi", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/executionApi/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
              if ("openai-completions" !== data23) {
                const err43 = { instancePath: instancePath + "/modelSelection/executionApi", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/executionApi/const", keyword: "const", params: { allowedValue: "openai-completions" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            }
            if (data19.structuredOutputMode !== void 0) {
              let data24 = data19.structuredOutputMode;
              if (typeof data24 !== "string") {
                const err44 = { instancePath: instancePath + "/modelSelection/structuredOutputMode", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/structuredOutputMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
              if (!(data24 === "strict" || data24 === "prompt_only" || data24 === "two_stage")) {
                const err45 = { instancePath: instancePath + "/modelSelection/structuredOutputMode", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/structuredOutputMode/enum", keyword: "enum", params: { allowedValues: schema64.properties.structuredOutputMode.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data19.contextWindowTokens !== void 0) {
              let data25 = data19.contextWindowTokens;
              if (!(typeof data25 == "number" && isFinite(data25))) {
                const err46 = { instancePath: instancePath + "/modelSelection/contextWindowTokens", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/contextWindowTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data19.maxOutputTokens !== void 0) {
              let data26 = data19.maxOutputTokens;
              if (!(typeof data26 == "number" && isFinite(data26))) {
                const err47 = { instancePath: instancePath + "/modelSelection/maxOutputTokens", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/maxOutputTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
            if (data19.reasoning !== void 0) {
              if (typeof data19.reasoning !== "boolean") {
                const err48 = { instancePath: instancePath + "/modelSelection/reasoning", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/reasoning/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
            if (data19.vision !== void 0) {
              if (typeof data19.vision !== "boolean") {
                const err49 = { instancePath: instancePath + "/modelSelection/vision", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/vision/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
            }
            if (data19.supportsRequiredToolChoice !== void 0) {
              if (typeof data19.supportsRequiredToolChoice !== "boolean") {
                const err50 = { instancePath: instancePath + "/modelSelection/supportsRequiredToolChoice", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/supportsRequiredToolChoice/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
            }
            if (data19.inputEstimator !== void 0) {
              let data30 = data19.inputEstimator;
              const _errs66 = errors;
              let valid11 = false;
              const _errs67 = errors;
              if (data30 && typeof data30 == "object" && !Array.isArray(data30)) {
                if (data30.kind === void 0) {
                  const err51 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err51];
                  } else {
                    vErrors.push(err51);
                  }
                  errors++;
                }
                for (const key4 in data30) {
                  if (!(key4 === "kind")) {
                    const err52 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err52];
                    } else {
                      vErrors.push(err52);
                    }
                    errors++;
                  }
                }
                if (data30.kind !== void 0) {
                  let data31 = data30.kind;
                  if (typeof data31 !== "string") {
                    const err53 = { instancePath: instancePath + "/modelSelection/inputEstimator/kind", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err53];
                    } else {
                      vErrors.push(err53);
                    }
                    errors++;
                  }
                  if ("character-v1" !== data31) {
                    const err54 = { instancePath: instancePath + "/modelSelection/inputEstimator/kind", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "character-v1" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err54];
                    } else {
                      vErrors.push(err54);
                    }
                    errors++;
                  }
                }
              } else {
                const err55 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
              var _valid0 = _errs67 === errors;
              valid11 = valid11 || _valid0;
              if (!valid11) {
                const _errs72 = errors;
                if (data30 && typeof data30 == "object" && !Array.isArray(data30)) {
                  if (data30.kind === void 0) {
                    const err56 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err56];
                    } else {
                      vErrors.push(err56);
                    }
                    errors++;
                  }
                  if (data30.encoding === void 0) {
                    const err57 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/required", keyword: "required", params: { missingProperty: "encoding" }, message: "must have required property 'encoding'" };
                    if (vErrors === null) {
                      vErrors = [err57];
                    } else {
                      vErrors.push(err57);
                    }
                    errors++;
                  }
                  for (const key5 in data30) {
                    if (!(key5 === "kind" || key5 === "encoding")) {
                      const err58 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err58];
                      } else {
                        vErrors.push(err58);
                      }
                      errors++;
                    }
                  }
                  if (data30.kind !== void 0) {
                    let data32 = data30.kind;
                    if (typeof data32 !== "string") {
                      const err59 = { instancePath: instancePath + "/modelSelection/inputEstimator/kind", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err59];
                      } else {
                        vErrors.push(err59);
                      }
                      errors++;
                    }
                    if ("token-encoding" !== data32) {
                      const err60 = { instancePath: instancePath + "/modelSelection/inputEstimator/kind", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "token-encoding" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err60];
                      } else {
                        vErrors.push(err60);
                      }
                      errors++;
                    }
                  }
                  if (data30.encoding !== void 0) {
                    let data33 = data30.encoding;
                    if (typeof data33 !== "string") {
                      const err61 = { instancePath: instancePath + "/modelSelection/inputEstimator/encoding", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/properties/encoding/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err61];
                      } else {
                        vErrors.push(err61);
                      }
                      errors++;
                    }
                    if (!(data33 === "cl100k_base" || data33 === "o200k_base")) {
                      const err62 = { instancePath: instancePath + "/modelSelection/inputEstimator/encoding", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/properties/encoding/enum", keyword: "enum", params: { allowedValues: schema64.properties.inputEstimator.anyOf[1].properties.encoding.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err62];
                      } else {
                        vErrors.push(err62);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err63 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err63];
                  } else {
                    vErrors.push(err63);
                  }
                  errors++;
                }
                var _valid0 = _errs72 === errors;
                valid11 = valid11 || _valid0;
              }
              if (!valid11) {
                const err64 = { instancePath: instancePath + "/modelSelection/inputEstimator", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/properties/inputEstimator/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err64];
                } else {
                  vErrors.push(err64);
                }
                errors++;
              } else {
                errors = _errs66;
                if (vErrors !== null) {
                  if (_errs66) {
                    vErrors.length = _errs66;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err65 = { instancePath: instancePath + "/modelSelection", schemaPath: "#/definitions/GoalSnapshotModelSelectionV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err65];
            } else {
              vErrors.push(err65);
            }
            errors++;
          }
        }
        if (data.goalPlan !== void 0) {
          if (!validate84(data.goalPlan, { instancePath: instancePath + "/goalPlan", parentData: data, parentDataProperty: "goalPlan", rootData })) {
            vErrors = vErrors === null ? validate84.errors : vErrors.concat(validate84.errors);
            errors = vErrors.length;
          }
        }
        if (data.completedRuns !== void 0) {
          let data35 = data.completedRuns;
          if (Array.isArray(data35)) {
            const len2 = data35.length;
            for (let i2 = 0; i2 < len2; i2++) {
              let data36 = data35[i2];
              if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                if (data36.runId === void 0) {
                  const err66 = { instancePath: instancePath + "/completedRuns/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
                if (data36.status === void 0) {
                  const err67 = { instancePath: instancePath + "/completedRuns/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err67];
                  } else {
                    vErrors.push(err67);
                  }
                  errors++;
                }
                if (data36.stepCount === void 0) {
                  const err68 = { instancePath: instancePath + "/completedRuns/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/required", keyword: "required", params: { missingProperty: "stepCount" }, message: "must have required property 'stepCount'" };
                  if (vErrors === null) {
                    vErrors = [err68];
                  } else {
                    vErrors.push(err68);
                  }
                  errors++;
                }
                if (data36.committedThroughSequence === void 0) {
                  const err69 = { instancePath: instancePath + "/completedRuns/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
                  if (vErrors === null) {
                    vErrors = [err69];
                  } else {
                    vErrors.push(err69);
                  }
                  errors++;
                }
                if (data36.messageRange === void 0) {
                  const err70 = { instancePath: instancePath + "/completedRuns/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/required", keyword: "required", params: { missingProperty: "messageRange" }, message: "must have required property 'messageRange'" };
                  if (vErrors === null) {
                    vErrors = [err70];
                  } else {
                    vErrors.push(err70);
                  }
                  errors++;
                }
                for (const key6 in data36) {
                  if (!(key6 === "runId" || key6 === "status" || key6 === "stepCount" || key6 === "committedThroughSequence" || key6 === "messageRange" || key6 === "continuation")) {
                    const err71 = { instancePath: instancePath + "/completedRuns/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                }
                if (data36.runId !== void 0) {
                  if (typeof data36.runId !== "string") {
                    const err72 = { instancePath: instancePath + "/completedRuns/" + i2 + "/runId", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                }
                if (data36.status !== void 0) {
                  let data38 = data36.status;
                  if (typeof data38 !== "string") {
                    const err73 = { instancePath: instancePath + "/completedRuns/" + i2 + "/status", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  }
                  if (!(data38 === "completed" || data38 === "failed" || data38 === "cancelled")) {
                    const err74 = { instancePath: instancePath + "/completedRuns/" + i2 + "/status", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/status/enum", keyword: "enum", params: { allowedValues: schema67.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err74];
                    } else {
                      vErrors.push(err74);
                    }
                    errors++;
                  }
                }
                if (data36.stepCount !== void 0) {
                  let data39 = data36.stepCount;
                  if (!(typeof data39 == "number" && isFinite(data39))) {
                    const err75 = { instancePath: instancePath + "/completedRuns/" + i2 + "/stepCount", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/stepCount/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err75];
                    } else {
                      vErrors.push(err75);
                    }
                    errors++;
                  }
                }
                if (data36.committedThroughSequence !== void 0) {
                  let data40 = data36.committedThroughSequence;
                  if (!(typeof data40 == "number" && isFinite(data40))) {
                    const err76 = { instancePath: instancePath + "/completedRuns/" + i2 + "/committedThroughSequence", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/committedThroughSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err76];
                    } else {
                      vErrors.push(err76);
                    }
                    errors++;
                  }
                }
                if (data36.messageRange !== void 0) {
                  let data41 = data36.messageRange;
                  if (data41 && typeof data41 == "object" && !Array.isArray(data41)) {
                    if (data41.start === void 0) {
                      const err77 = { instancePath: instancePath + "/completedRuns/" + i2 + "/messageRange", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/messageRange/required", keyword: "required", params: { missingProperty: "start" }, message: "must have required property 'start'" };
                      if (vErrors === null) {
                        vErrors = [err77];
                      } else {
                        vErrors.push(err77);
                      }
                      errors++;
                    }
                    if (data41.end === void 0) {
                      const err78 = { instancePath: instancePath + "/completedRuns/" + i2 + "/messageRange", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/messageRange/required", keyword: "required", params: { missingProperty: "end" }, message: "must have required property 'end'" };
                      if (vErrors === null) {
                        vErrors = [err78];
                      } else {
                        vErrors.push(err78);
                      }
                      errors++;
                    }
                    for (const key7 in data41) {
                      if (!(key7 === "start" || key7 === "end")) {
                        const err79 = { instancePath: instancePath + "/completedRuns/" + i2 + "/messageRange", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/messageRange/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err79];
                        } else {
                          vErrors.push(err79);
                        }
                        errors++;
                      }
                    }
                    if (data41.start !== void 0) {
                      let data42 = data41.start;
                      if (!(typeof data42 == "number" && isFinite(data42))) {
                        const err80 = { instancePath: instancePath + "/completedRuns/" + i2 + "/messageRange/start", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/messageRange/properties/start/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err80];
                        } else {
                          vErrors.push(err80);
                        }
                        errors++;
                      }
                    }
                    if (data41.end !== void 0) {
                      let data43 = data41.end;
                      if (!(typeof data43 == "number" && isFinite(data43))) {
                        const err81 = { instancePath: instancePath + "/completedRuns/" + i2 + "/messageRange/end", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/messageRange/properties/end/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                        if (vErrors === null) {
                          vErrors = [err81];
                        } else {
                          vErrors.push(err81);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err82 = { instancePath: instancePath + "/completedRuns/" + i2 + "/messageRange", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/messageRange/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err82];
                    } else {
                      vErrors.push(err82);
                    }
                    errors++;
                  }
                }
                if (data36.continuation !== void 0) {
                  let data44 = data36.continuation;
                  if (data44 && typeof data44 == "object" && !Array.isArray(data44)) {
                    if (data44.messageId === void 0) {
                      const err83 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
                      if (vErrors === null) {
                        vErrors = [err83];
                      } else {
                        vErrors.push(err83);
                      }
                      errors++;
                    }
                    if (data44.content === void 0) {
                      const err84 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                      if (vErrors === null) {
                        vErrors = [err84];
                      } else {
                        vErrors.push(err84);
                      }
                      errors++;
                    }
                    if (data44.nextRunId === void 0) {
                      const err85 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/required", keyword: "required", params: { missingProperty: "nextRunId" }, message: "must have required property 'nextRunId'" };
                      if (vErrors === null) {
                        vErrors = [err85];
                      } else {
                        vErrors.push(err85);
                      }
                      errors++;
                    }
                    for (const key8 in data44) {
                      if (!(key8 === "messageId" || key8 === "content" || key8 === "nextRunId")) {
                        const err86 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err86];
                        } else {
                          vErrors.push(err86);
                        }
                        errors++;
                      }
                    }
                    if (data44.messageId !== void 0) {
                      if (typeof data44.messageId !== "string") {
                        const err87 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation/messageId", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err87];
                        } else {
                          vErrors.push(err87);
                        }
                        errors++;
                      }
                    }
                    if (data44.content !== void 0) {
                      if (typeof data44.content !== "string") {
                        const err88 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation/content", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err88];
                        } else {
                          vErrors.push(err88);
                        }
                        errors++;
                      }
                    }
                    if (data44.nextRunId !== void 0) {
                      if (typeof data44.nextRunId !== "string") {
                        const err89 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation/nextRunId", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/properties/nextRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err89];
                        } else {
                          vErrors.push(err89);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err90 = { instancePath: instancePath + "/completedRuns/" + i2 + "/continuation", schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/properties/continuation/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err90];
                    } else {
                      vErrors.push(err90);
                    }
                    errors++;
                  }
                }
              } else {
                const err91 = { instancePath: instancePath + "/completedRuns/" + i2, schemaPath: "#/definitions/GoalSnapshotCompletedRunV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err91];
                } else {
                  vErrors.push(err91);
                }
                errors++;
              }
            }
          } else {
            const err92 = { instancePath: instancePath + "/completedRuns", schemaPath: "#/properties/completedRuns/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err92];
            } else {
              vErrors.push(err92);
            }
            errors++;
          }
        }
      } else {
        const err93 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err93];
        } else {
          vErrors.push(err93);
        }
        errors++;
      }
      validate14.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.metadata === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "metadata" }, message: "must have required property 'metadata'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.definition === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "definition" }, message: "must have required property 'definition'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.state === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "metadata" || key0 === "definition" || key0 === "state")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err5 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.metadata !== void 0) {
          let data1 = data.metadata;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.schemaVersion === void 0) {
              const err6 = { instancePath: instancePath + "/metadata", schemaPath: "#/definitions/GoalSnapshotMetadataV1/required", keyword: "required", params: { missingProperty: "schemaVersion" }, message: "must have required property 'schemaVersion'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "schemaVersion")) {
                const err7 = { instancePath: instancePath + "/metadata", schemaPath: "#/definitions/GoalSnapshotMetadataV1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
            if (data1.schemaVersion !== void 0) {
              let data2 = data1.schemaVersion;
              if (!(typeof data2 == "number" && isFinite(data2))) {
                const err8 = { instancePath: instancePath + "/metadata/schemaVersion", schemaPath: "#/definitions/GoalSnapshotMetadataV1/properties/schemaVersion/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
              if (1 !== data2) {
                const err9 = { instancePath: instancePath + "/metadata/schemaVersion", schemaPath: "#/definitions/GoalSnapshotMetadataV1/properties/schemaVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            }
          } else {
            const err10 = { instancePath: instancePath + "/metadata", schemaPath: "#/definitions/GoalSnapshotMetadataV1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.definition !== void 0) {
          if (!validate12(data.definition, { instancePath: instancePath + "/definition", parentData: data, parentDataProperty: "definition", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.state !== void 0) {
          if (!validate14(data.state, { instancePath: instancePath + "/state", parentData: data, parentDataProperty: "state", rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
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
export default require_GoalSnapshotV1_validator();
