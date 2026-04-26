import {
  changeUserPassword,
  isSingleUserRuntime,
  loadUserSettings,
  saveUserFullName
} from "/mod/_core/user/storage.js";
import { t as i18nT } from "/mod/_core/i18n/i18n.js";

const PASSWORD_REDIRECT_DELAY_MS = 900;

function logUserPageError(context, error) {
  console.error(`[user-page] ${context}`, error);
}

const model = {
  currentFullName: "",
  fullNameDraft: "",
  groups: [],
  lastSavedFullName: "",
  loading: false,
  managedGroups: [],
  passwordConfirm: "",
  passwordCurrent: "",
  passwordNew: "",
  passwordSaving: false,
  passwordStatusText: "",
  passwordStatusTone: "",
  profileSaving: false,
  profileStatusText: "",
  profileStatusTone: "",
  reauthPending: false,
  singleUserApp: false,
  username: "",

  async init() {
    this.singleUserApp = isSingleUserRuntime();
    this.loading = true;
    this.setProfileStatus("");

    try {
      await this.loadSettings(i18nT("user:profile.loaded"));
    } catch (error) {
      logUserPageError("init failed", error);
      this.setProfileStatus(String(error?.message || i18nT("user:profile.loadFailed")), "error");
    } finally {
      this.loading = false;
    }
  },

  get canChangePassword() {
    return Boolean(
      !this.loading &&
        !this.passwordSaving &&
        !this.reauthPending &&
        !this.singleUserApp &&
        this.passwordCurrent &&
        this.passwordNew &&
        this.passwordConfirm &&
        !this.passwordMismatch
    );
  },

  get displayFullName() {
    return this.currentFullName || this.username || i18nT("user:account.fallbackName");
  },

  get isFullNameDirty() {
    return this.fullNameDraft !== this.lastSavedFullName;
  },

  get passwordMismatch() {
    return Boolean(this.passwordConfirm) && this.passwordNew !== this.passwordConfirm;
  },

  async loadSettings(successText = "") {
    const loaded = await loadUserSettings();

    this.username = loaded.identity.username;
    this.currentFullName = loaded.fullName;
    this.fullNameDraft = loaded.fullName;
    this.lastSavedFullName = loaded.fullName;
    this.groups = [...loaded.identity.groups];
    this.managedGroups = [...loaded.identity.managedGroups];

    if (successText) {
      this.setProfileStatus(successText);
    }
  },

  async reloadProfile() {
    if (this.loading || this.profileSaving || this.passwordSaving || this.reauthPending) {
      return;
    }

    this.loading = true;
    this.setProfileStatus(i18nT("user:profile.refreshing"));

    try {
      await this.loadSettings(i18nT("user:profile.refreshed"));
    } catch (error) {
      logUserPageError("reloadProfile failed", error);
      this.setProfileStatus(String(error?.message || i18nT("user:profile.reloadFailed")), "error");
    } finally {
      this.loading = false;
    }
  },

  async saveFullName() {
    if (this.loading || this.profileSaving || this.passwordSaving || this.reauthPending) {
      return;
    }

    this.profileSaving = true;
    this.setProfileStatus(i18nT("user:profile.savingProfile"));

    try {
      const result = await saveUserFullName(this.fullNameDraft, {
        username: this.username
      });
      this.currentFullName = result.fullName;
      this.fullNameDraft = result.fullName;
      this.lastSavedFullName = result.fullName;
      this.setProfileStatus(i18nT("user:profile.updated"), "success");
    } catch (error) {
      logUserPageError("saveFullName failed", error);
      this.setProfileStatus(String(error?.message || i18nT("user:profile.saveFailed")), "error");
    } finally {
      this.profileSaving = false;
    }
  },

  clearPasswordForm() {
    this.passwordCurrent = "";
    this.passwordNew = "";
    this.passwordConfirm = "";
  },

  async changePassword() {
    if (this.singleUserApp) {
      this.setPasswordStatus(i18nT("user:password.notAvailableHere"), "error");
      return;
    }

    if (this.passwordMismatch) {
      this.setPasswordStatus(i18nT("user:password.mismatch"), "error");
      return;
    }

    if (!this.canChangePassword) {
      this.setPasswordStatus(i18nT("user:password.fillFields"), "error");
      return;
    }

    this.passwordSaving = true;
    this.setPasswordStatus(i18nT("user:password.changingStatus"));

    try {
      const result = await changeUserPassword(this.passwordCurrent, this.passwordNew);
      this.clearPasswordForm();
      this.reauthPending = Boolean(result?.signedOut);
      this.setPasswordStatus(
        this.reauthPending
          ? i18nT("user:password.changedRedirect")
          : i18nT("user:password.changed"),
        "success"
      );

      if (this.reauthPending) {
        window.setTimeout(() => {
          window.location.assign("/login");
        }, PASSWORD_REDIRECT_DELAY_MS);
      }
    } catch (error) {
      logUserPageError("changePassword failed", error);
      this.setPasswordStatus(String(error?.message || i18nT("user:password.changeFailed")), "error");
    } finally {
      this.passwordSaving = false;
    }
  },

  setPasswordStatus(text = "", tone = "") {
    this.passwordStatusText = String(text || "");
    this.passwordStatusTone = String(tone || "");
  },

  setProfileStatus(text = "", tone = "") {
    this.profileStatusText = String(text || "");
    this.profileStatusTone = String(tone || "");
  }
};

globalThis.space.fw.createStore("userPage", model);
