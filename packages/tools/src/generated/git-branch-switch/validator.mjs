var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GitBranchSwitchInput-validator.cjs
var require_GitBranchSwitchInput_validator = __commonJS({
  "GitBranchSwitchInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.branch === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/GitBranchSwitchInput/required", keyword: "required", params: { missingProperty: "branch" }, message: "must have required property 'branch'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "branch" || key0 === "repoPath" || key0 === "createIfNotExists")) {
            const err1 = { instancePath, schemaPath: "#/definitions/GitBranchSwitchInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.branch !== void 0) {
          if (typeof data.branch !== "string") {
            const err2 = { instancePath: instancePath + "/branch", schemaPath: "#/definitions/GitBranchSwitchInput/properties/branch/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.repoPath !== void 0) {
          if (typeof data.repoPath !== "string") {
            const err3 = { instancePath: instancePath + "/repoPath", schemaPath: "#/definitions/GitBranchSwitchInput/properties/repoPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.createIfNotExists !== void 0) {
          if (typeof data.createIfNotExists !== "boolean") {
            const err4 = { instancePath: instancePath + "/createIfNotExists", schemaPath: "#/definitions/GitBranchSwitchInput/properties/createIfNotExists/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
      } else {
        const err5 = { instancePath, schemaPath: "#/definitions/GitBranchSwitchInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_GitBranchSwitchInput_validator();
