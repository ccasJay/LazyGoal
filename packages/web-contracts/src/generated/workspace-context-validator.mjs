var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserWorkspaceContext-validator.cjs
var require_BrowserWorkspaceContext_validator = __commonJS({
  "BrowserWorkspaceContext-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "workspaceRoot": { "type": "string", "pattern": "\\S" }, "worktreeRoot": { "type": ["string", "null"], "pattern": "\\S" }, "branch": { "type": ["string", "null"], "pattern": "\\S" } }, "required": ["workspaceRoot", "worktreeRoot", "branch"], "additionalProperties": false, "description": "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0A\u4E0B\u6587\u89C6\u56FE\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.workspaceRoot === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserWorkspaceContext/required", keyword: "required", params: { missingProperty: "workspaceRoot" }, message: "must have required property 'workspaceRoot'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.worktreeRoot === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserWorkspaceContext/required", keyword: "required", params: { missingProperty: "worktreeRoot" }, message: "must have required property 'worktreeRoot'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.branch === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/BrowserWorkspaceContext/required", keyword: "required", params: { missingProperty: "branch" }, message: "must have required property 'branch'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "workspaceRoot" || key0 === "worktreeRoot" || key0 === "branch")) {
            const err3 = { instancePath, schemaPath: "#/definitions/BrowserWorkspaceContext/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.workspaceRoot !== void 0) {
          let data0 = data.workspaceRoot;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err4 = { instancePath: instancePath + "/workspaceRoot", schemaPath: "#/definitions/BrowserWorkspaceContext/properties/workspaceRoot/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/workspaceRoot", schemaPath: "#/definitions/BrowserWorkspaceContext/properties/workspaceRoot/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.worktreeRoot !== void 0) {
          let data1 = data.worktreeRoot;
          if (typeof data1 !== "string" && data1 !== null) {
            const err6 = { instancePath: instancePath + "/worktreeRoot", schemaPath: "#/definitions/BrowserWorkspaceContext/properties/worktreeRoot/type", keyword: "type", params: { type: schema12.properties.worktreeRoot.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/worktreeRoot", schemaPath: "#/definitions/BrowserWorkspaceContext/properties/worktreeRoot/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
        if (data.branch !== void 0) {
          let data2 = data.branch;
          if (typeof data2 !== "string" && data2 !== null) {
            const err8 = { instancePath: instancePath + "/branch", schemaPath: "#/definitions/BrowserWorkspaceContext/properties/branch/type", keyword: "type", params: { type: schema12.properties.branch.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/branch", schemaPath: "#/definitions/BrowserWorkspaceContext/properties/branch/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
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
        const err10 = { instancePath, schemaPath: "#/definitions/BrowserWorkspaceContext/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserWorkspaceContext_validator();
