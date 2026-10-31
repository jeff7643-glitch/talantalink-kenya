"use client";

import { useActionState } from "react";
import { submitTrustReport, type TrustReportState } from "./actions";
import styles from "./trust.module.css";

const initialState: TrustReportState = {};

export default function ReportForm() {
  const [state, formAction, pending] = useActionState(submitTrustReport, initialState);

  return (
    <form className={styles.form} action={formAction}>
      <label>
        What are you reporting?
        <select name="targetType" required defaultValue="opportunity">
          <option value="opportunity">Job or opportunity</option>
          <option value="post">Post</option>
          <option value="comment">Comment</option>
          <option value="profile">Profile</option>
          <option value="user">Member</option>
        </select>
      </label>

      <label>
        Item ID
        <input
          name="targetId"
          type="text"
          autoComplete="off"
          required
          maxLength={36}
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          aria-describedby="target-help"
        />
        <span id="target-help" className={styles.help}>
          Use the ID from the item’s link or details.
        </span>
      </label>

      <label>
        Reason
        <select name="reason" required defaultValue="scam">
          <option value="scam">Scam or fraudulent content</option>
          <option value="fee_request">Requests payment or fees</option>
          <option value="misleading">Misleading information</option>
          <option value="spam">Spam</option>
          <option value="harassment">Harassment</option>
          <option value="inappropriate">Inappropriate content</option>
          <option value="other">Other safety concern</option>
        </select>
      </label>

      <label>
        Additional details <span className={styles.optional}>(optional)</span>
        <textarea name="details" rows={5} maxLength={900} />
      </label>

      <p className={styles.privacy}>
        Reports are visible only to you and authorized moderators. Do not include
        passwords, identification numbers, or other sensitive personal details.
      </p>

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Sending report…" : "Submit report"}
      </button>

      <p
        className={state.error ? styles.error : styles.success}
        aria-live="polite"
        role={state.error ? "alert" : "status"}
      >
        {state.error ?? state.success ?? ""}
      </p>
    </form>
  );
}
