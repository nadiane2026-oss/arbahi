package dz.arbahi.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.TimeUnit;

/** فحص Ecotrack في الخلفية (كل 15 دقيقة) وإرسال إشعارات حتى والتطبيق مغلق */
@CapacitorPlugin(name = "ArbahiBg")
public class ArbahiBgPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        String url = call.getString("url", "");
        String token = call.getString("token", "");
        SharedPreferences sp = getContext().getSharedPreferences("arbahi_bg", Context.MODE_PRIVATE);
        sp.edit().putString("url", url).putString("token", token).apply();
        WorkManager wm = WorkManager.getInstance(getContext());
        if (url.isEmpty() || token.isEmpty()) {
            wm.cancelUniqueWork("arbahi_poll");
        } else {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(PollWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
            wm.enqueueUniquePeriodicWork("arbahi_poll", ExistingPeriodicWorkPolicy.UPDATE, req);
        }
        call.resolve();
    }

    @PluginMethod
    public void runNow(PluginCall call) {
        WorkManager.getInstance(getContext()).enqueue(new OneTimeWorkRequest.Builder(PollWorker.class).build());
        call.resolve();
    }

    /** يفتح إعداد "تجاهل تحسين البطارية" ليسمح للتطبيق بالعمل في الخلفية */
    @PluginMethod
    public void batterySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
