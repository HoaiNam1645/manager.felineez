

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const MSAL_CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID || "";
export const MSAL_AUTHORITY = "https://login.microsoftonline.com/common";
export const MSAL_SCOPES = ["openid", "profile", "email", "Mail.Read", "User.Read", "offline_access"];