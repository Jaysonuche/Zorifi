class PrivacyPreferences {
  PrivacyPreferences({
    this.ai = false,
    this.projectDetails = false,
    this.updatedAt,
  });
  static const version = '2026-10-09';
  static const controller = 'Jayson Uche';
  static const email = 'zorifvideoeditor@gmail.com';
  bool ai, projectDetails;
  String? updatedAt;
  void choose({required bool allowAi, required bool shareProject}) {
    ai = allowAi;
    projectDetails = allowAi && shareProject;
    updatedAt = DateTime.now().toUtc().toIso8601String();
  }

  Map<String, dynamic> toJson() => {
    'version': version,
    'ai': ai,
    'projectDetails': projectDetails,
    'updatedAt': updatedAt,
  };
  factory PrivacyPreferences.fromJson(Map<String, dynamic> data) =>
      data['version'] == version
      ? PrivacyPreferences(
          ai: data['ai'] == true,
          projectDetails: data['ai'] == true && data['projectDetails'] == true,
          updatedAt: data['updatedAt'] as String?,
        )
      : PrivacyPreferences();
  static const notice = '''Data controller: Jayson Uche
Privacy contact: zorifvideoeditor@gmail.com

Projects, imported media copies, preferences and your consent choices stay in this app on your device until you erase them or remove the app. Original source files and backups saved outside the app remain. Chat messages and cloud session tokens are held in memory for this session; passwords and tokens are not saved to project files.

Local editing and requested account services use information to provide the service you request. Optional Vanessa processing uses your consent, which you can withdraw at any time. When enabled, chat messages go to your chosen backend and its configured language provider (currently OpenAI in the restored backend). Project names, file names and clip timings are sent only when you separately enable sharing project details. This mobile chat does not upload original media. Firebase handles email/password sign-in and cloud subscription records when configured.

AI consent is separate from the Terms and optional for local editing. Withdrawing it stops future chat requests; previously sent requests cannot be recalled automatically. Cloud/provider retention and international-transfer arrangements depend on the deployed services and require controller review before public launch.

Export your local metadata or use project backups to copy your original imported media. You can correct project names and editing details, withdraw AI consent, and erase this app’s local editor data. For cloud account deletion, previously sent support/provider data, access, rectification, portability, restriction or objection requests, contact the privacy email. Local erasure does not delete cloud records, cancel billing or remove external backups.

You may complain to the UK Information Commissioner at ico.org.uk or your local EU supervisory authority. The mobile assistant provides creative advice; it does not make solely automated decisions with legal or similarly significant effects.''';
}
