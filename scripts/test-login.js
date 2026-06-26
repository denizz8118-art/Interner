const bcrypt = require("bcryptjs");
const { createSuperuserClient } = require("./pb-common");

async function findUserRecordByEmail(pb, email) {
  try {
    return await pb
      .collection("users")
      .getFirstListItem(pb.filter("email = {:email}", { email: String(email || "").trim().toLowerCase() }));
  } catch (_e) {
    return null;
  }
}

async function login(pb, email, password) {
  const record = await findUserRecordByEmail(pb, email);
  if (!record) return { ok: false, error: "Kayit bulunamadi" };
  const hash = String(record.passwordHash || "");
  const matches = hash ? bcrypt.compareSync(password, hash) : password === "";
  if (!matches) return { ok: false, error: "Sifre yanlis" };
  return { ok: true, user: record.data };
}

async function main() {
  const pb = await createSuperuserClient();
  const all = await pb.collection("users").getFullList();
  console.log("DB users:", all.map((u) => u.email));

  for (const cred of [
    ["i1@g.com", "123456"],
    ["i2@g.com", "123456"],
    ["I1@G.COM", "123456"]
  ]) {
    const result = await login(pb, cred[0], cred[1]);
    console.log(cred[0], "=>", result.ok ? `OK rol=${result.user?.rol}` : result.error);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
