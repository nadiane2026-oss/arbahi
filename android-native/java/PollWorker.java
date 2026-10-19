package dz.arbahi.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.ProcessLifecycleOwner;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** يجلب طلبات Ecotrack، ويقارن حالاتها بما حُفظ سابقاً، ويرسل إشعاراً عند أي تغيير */
public class PollWorker extends Worker {
    static final String CH_MONEY = "money";
    static final String CH_ORDERS = "orders_bg";

    public PollWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences("arbahi_bg", Context.MODE_PRIVATE);
        String url = sp.getString("url", "");
        String token = sp.getString("token", "");
        if (url.isEmpty() || token.isEmpty()) return Result.success();
        try {
            JSONObject known = new JSONObject(sp.getString("known", "{}"));
            boolean first = known.length() == 0;
            boolean foreground = false;
            try {
                foreground = ProcessLifecycleOwner.get().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED);
            } catch (Throwable ignore) { }

            List<String[]> changes = new ArrayList<>(); // {key, name, label, money}
            SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            String start = df.format(new Date(System.currentTimeMillis() - 45L * 86400000L));
            String end = df.format(new Date(System.currentTimeMillis() + 86400000L));
            String firstSeen = "";
            for (int page = 1; page <= 4; page++) {
                String body = get(url, token, page, start, end);
                if (body == null) break;
                JSONArray arr = findArray(new org.json.JSONTokener(body).nextValue(), 0);
                if (arr == null || arr.length() == 0) break;
                String firstTracking = tracking(arr.optJSONObject(0));
                if (page > 1 && firstTracking.equals(firstSeen)) break;
                firstSeen = firstTracking;
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.optJSONObject(i);
                    if (o == null) continue;
                    String trk = tracking(o);
                    if (trk.isEmpty()) continue;
                    String label = label(o);
                    String paySig = paySig(o);
                    String sig = label + "|" + paySig;
                    String old = known.optString(trk, null);
                    if (old != null && !old.equals(sig) && !first) {
                        boolean money = isMoney(label) || !paySig.equals(old.contains("|") ? old.substring(old.indexOf('|') + 1) : "");
                        changes.add(new String[] { trk, name(o), label, money ? "1" : "0" });
                    }
                    known.put(trk, sig);
                }
                if (arr.length() < 10) break;
            }
            sp.edit().putString("known", trim(known).toString()).apply();
            if (!first && !foreground && !changes.isEmpty()) notifyAll(ctx, changes);
            return Result.success();
        } catch (Throwable t) {
            return Result.retry();
        }
    }

    // ———————— شبكة ————————
    private static String get(String base, String token, int page, String start, String end) {
        HttpURLConnection c = null;
        try {
            String b = base.replaceAll("/+$", "");
            URL u = new URL(b + "/api/v1/get/orders?page=" + page + "&start_date=" + start + "&end_date=" + end);
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Accept", "application/json");
            if (c.getResponseCode() >= 300) return null;
            BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ———————— قراءة الرد ————————
    private static JSONArray findArray(Object v, int depth) {
        if (v instanceof JSONArray) return (JSONArray) v;
        if (depth > 3 || !(v instanceof JSONObject)) return null;
        JSONObject o = (JSONObject) v;
        String[] pref = { "data", "orders", "results", "items" };
        for (String k : pref) {
            if (o.has(k)) { JSONArray a = findArray(o.opt(k), depth + 1); if (a != null) return a; }
        }
        Iterator<String> it = o.keys();
        while (it.hasNext()) { JSONArray a = findArray(o.opt(it.next()), depth + 1); if (a != null) return a; }
        return null;
    }

    private static String pick(JSONObject o, String... keys) {
        if (o == null) return "";
        for (String k : keys) {
            Object v = o.opt(k);
            if (v == null || v == JSONObject.NULL) continue;
            if (v instanceof JSONObject) {
                String s = pick((JSONObject) v, "name", "label", "status", "code");
                if (!s.isEmpty()) return s;
                continue;
            }
            String s = String.valueOf(v).trim();
            if (!s.isEmpty()) return s;
        }
        return "";
    }

    private static String tracking(JSONObject o) { return pick(o, "tracking", "tracking_number", "code"); }
    private static String label(JSONObject o) { return pick(o, "status", "statut", "etat", "state", "status_label", "situation", "last_status"); }
    private static String name(JSONObject o) { return pick(o, "client", "nom_client", "name", "customer"); }

    /** إشارات الدفع في الحقول (paid, date_paiement, encaisse...) */
    private static String paySig(JSONObject o) {
        StringBuilder sb = new StringBuilder();
        Iterator<String> it = o.keys();
        while (it.hasNext()) {
            String k = it.next();
            if (!k.toLowerCase(Locale.ROOT).matches(".*(pay|paid|paye|paie|encaiss|cash|collect|regl|recouv).*")) continue;
            Object v = o.opt(k);
            if (v == null || v == JSONObject.NULL || v instanceof JSONObject || v instanceof JSONArray) continue;
            String s = String.valueOf(v).trim();
            if (s.isEmpty() || s.equals("0") || s.equalsIgnoreCase("false") || s.equalsIgnoreCase("null")) continue;
            sb.append(k).append('=').append(s).append(';');
        }
        return sb.toString();
    }

    private static String plain(String s) {
        return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    private static boolean isMoney(String label) {
        String n = plain(label);
        return n.contains("paiement") || n.contains("paye") || n.contains("encaiss") || n.contains("paid") || n.contains("cash");
    }

    /** نحتفظ بآخر 800 طلب فقط */
    private static JSONObject trim(JSONObject known) {
        if (known.length() <= 800) return known;
        try {
            JSONObject out = new JSONObject();
            Iterator<String> it = known.keys();
            int skip = known.length() - 800;
            while (it.hasNext()) { String k = it.next(); if (skip-- > 0) continue; out.put(k, known.get(k)); }
            return out;
        } catch (Exception e) { return known; }
    }

    // ———————— إشعارات ————————
    private void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CH_MONEY) == null) {
            NotificationChannel ch = new NotificationChannel(CH_MONEY, "الأموال والدفعات", NotificationManager.IMPORTANCE_HIGH);
            Uri snd = Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/money");
            ch.setSound(snd, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CH_ORDERS) == null) {
            nm.createNotificationChannel(new NotificationChannel(CH_ORDERS, "تحديثات الطلبات", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    private void notifyAll(Context ctx, List<String[]> changes) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return;
        ensureChannels(ctx);
        Intent li = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, li, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int moneyCount = 0, other = 0;
        List<String[]> shown = new ArrayList<>();
        for (String[] c : changes) { if (c[3].equals("1")) { moneyCount++; shown.add(c); } else other++; }
        int id = (int) (System.currentTimeMillis() % 100000);
        if (moneyCount > 0) {
            StringBuilder body = new StringBuilder();
            int n = 0;
            for (String[] c : shown) { if (n++ >= 4) break; body.append(c[1].isEmpty() ? c[0] : c[1]).append(": ").append(c[2]).append('\n'); }
            post(ctx, CH_MONEY, id++, "💰 تحديث مالي في Ecotrack (" + moneyCount + ")", body.toString().trim(), pi, true);
        }
        int n = 0;
        for (String[] c : changes) {
            if (c[3].equals("1")) continue;
            if (n++ >= 5) break;
            post(ctx, CH_ORDERS, id++, c[1].isEmpty() ? c[0] : c[1], c[2], pi, false);
        }
        if (other > 5) post(ctx, CH_ORDERS, id++, "تحديثات جديدة في الطلبات", (other - 5) + " تحديثات أخرى. افتح التطبيق", pi, false);
    }

    private void post(Context ctx, String channel, int id, String title, String text, PendingIntent pi, boolean money) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(text.split("\n")[0])
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(false)
            .setOnlyAlertOnce(false)
            .setPriority(money ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT);
        if (money && Build.VERSION.SDK_INT < 26) b.setSound(Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/money"));
        try { NotificationManagerCompat.from(ctx).notify(id, b.build()); } catch (SecurityException ignore) { }
    }
}
