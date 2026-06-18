// Public-facing Master profile, stored locally in the static build.
(() => {
  if (!document.body.matches("[data-master-page='profile']")) return;
  const PROFILE_KEY = "apex_master_profile";
  const form = document.querySelector("[data-master-profile-form]");
  const photoInput = document.querySelector("[data-profile-photo]");
  const avatar = document.querySelector("[data-profile-avatar]");
  const user = window.ApexStaticAuth?.getUser?.() || {};
  const stored = readStore(PROFILE_KEY, {});
  const profile = {
    displayName: stored.displayName || user.name || user.nickname || "Mestre Apex",
    title: stored.title || "Narrador de mundos",
    age: stored.age || "",
    experienceYears: stored.experienceYears || 0,
    systems: stored.systems || "D&D 5e",
    qualities: stored.qualities || "",
    style: stored.style || "",
    availability: stored.availability || "",
    experience: stored.experience || "Iniciantes e veteranos",
    bio: stored.bio || "",
    avatar: stored.avatar || user.avatar || ""
  };
  let photoProcessing = Promise.resolve(profile.avatar);
  const applyPreview = current => {
    document.querySelector("[data-profile-preview-name]").textContent = current.displayName || "Mestre Apex";
    document.querySelector("[data-profile-preview-title]").textContent = current.title || "Narrador de mundos";
    document.querySelector("[data-profile-experience]").textContent = Number(current.experienceYears || 0);
    document.querySelector("[data-profile-campaigns]").textContent = readCampaigns().filter(campaign => !campaign.archived).length;
    document.querySelector("[data-profile-initial]").textContent = (current.displayName || "M").trim().charAt(0).toUpperCase();
    avatar.style.backgroundImage = current.avatar ? `url("${current.avatar}")` : "";
    avatar.classList.toggle("has-image", Boolean(current.avatar));
  };
  Object.entries(profile).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].value = value; });
  applyPreview(profile);
  [form.elements.displayName, form.elements.title, form.elements.experienceYears].forEach(input => input.addEventListener("input", () => applyPreview({...profile, displayName: form.elements.displayName.value, title: form.elements.title.value, experienceYears: form.elements.experienceYears.value, avatar: form.dataset.avatar || profile.avatar})));
  form.dataset.avatar = profile.avatar;
  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    photoProcessing = prepareLibraryImage(file).then(source => {
      form.dataset.avatar = source;
      applyPreview({...profile, displayName: form.elements.displayName.value, title: form.elements.title.value, experienceYears: form.elements.experienceYears.value, avatar: source});
      return source;
    }).catch(error => {
      masterToast(error.message);
      return form.dataset.avatar || "";
    });
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    await photoProcessing;
    const saved = {...Object.fromEntries(new FormData(form).entries()), avatar: form.dataset.avatar || "", updatedAt: new Date().toISOString()};
    writeStore(PROFILE_KEY, saved);
    window.ApexStaticAuth?.saveUser?.({...user, name: saved.displayName, nickname: saved.displayName, avatar: saved.avatar});
    profile.displayName = saved.displayName;
    profile.title = saved.title;
    profile.experienceYears = saved.experienceYears;
    profile.avatar = saved.avatar;
    applyPreview(saved);
  });
})();
