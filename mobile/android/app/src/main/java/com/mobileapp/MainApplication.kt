package com.mobileapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createNotificationChannel()
  }

  private fun createNotificationChannel() {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      val channelId = "pos_high_importance_channel"
      val channelName = "POS High Importance"
      val channelDescription = "Kênh thông báo đơn hàng khẩn cấp"
      val importance = android.app.NotificationManager.IMPORTANCE_HIGH
      val channel = android.app.NotificationChannel(channelId, channelName, importance).apply {
        description = channelDescription
        enableLights(true)
        enableVibration(true)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      }
      val notificationManager = getSystemService(android.app.NotificationManager::class.java)
      notificationManager.createNotificationChannel(channel)
    }
  }
}
