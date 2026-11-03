plugins {
    id("com.android.application")
}

// Release signing comes from environment variables (set by GitHub Actions secrets).
val keystoreFile: String? = System.getenv("KEYSTORE_FILE")

android {
    namespace = "com.voiceguru.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.voiceguru.app"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "2.1"
    }

    signingConfigs {
        create("release") {
            if (keystoreFile != null) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    // Pyodide files must stay uncompressed-friendly and are served as-is
    androidResources {
        noCompress += listOf("wasm", "zip", "mjs", "js", "json")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
