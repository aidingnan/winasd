# WiFi Manager

This document defines the WiFi Manager interface provided by winasd to client device.

This interface is designed as a generic interface, irrelevant to underlying communication channel. The first version will be implemented on top of a transport layer based on BLE communication. Then it is provided with http service, which is much easier.

Unlike NetworkManager, this interface is responsible for wifi management only, not for all network interfaces in a system. So the assumption in current stage could be the system has one and only one wifi adapter, and no other network interface, at least not one for internet connection.

Implementation side, the preferred backend is directly programing `wpa_supplicant` via its dbus interface. This makes things simpler. NetworkManager is inconvinient in following aspects:
- it has a connection abstraction, which is widely suitable for any kind of internet connection, including adsl, vpn, etc. This overkills.
- it manages connection file on its own. And there are some confusions in updating an existing connection, eg. updating the password, or creating a new one. Parsing the file is not a good choice.

# Design

The Design is copied from Android brutely.

Android is the most popular operating system. Most Android devices have one WiFi interface and one or more cellular data channels. Ethernet could also be supported in some industrial devices. Its WiFiManager interface is a mature and easy to use interface, which is familiar to most users.

https://developer.android.com/reference/android/net/wifi/WifiManager

## Responsibility

Android developer documents have an concise description on the responsibility of WifiManager class.

> - The list of configured networks. The list can be viewed and updated, and attributes of individual entries can be modified.
> - The currently active Wi-Fi network, if any. Connectivity can be established or torn down, and dynamic information about the state of the network can be queried.
> - Results of access point scans, containing enough information to make decisions about what access point to connect to.
> - It defines the names of various Intent actions that are broadcast upon any sort of change in Wi-Fi state.


# Resources

## `WifiNetworkSuggestion`

In old version of android, there is an api to retrieve all saved configured network.

```java
public List<WifiConfiguration> getConfiguredNetworks ()
```

From api level 29 (Android Q/10), such api is deprecated. New apis are introduced to configuring wifi:

```java 
public int addNetworkSuggestions (List<WifiNetworkSuggestion> networkSuggestions);
public int removeNetworkSuggestions (List<WifiNetworkSuggestion> networkSuggestions);
```

However, there is no way to retrieve the saved configured network. The user can only remove a configured network when it is in scan result.

> https://stackoverflow.com/questions/58093550/how-to-list-saved-networks-in-android-10
> https://stackoverflow.com/questions/56905956/is-it-possible-to-add-a-network-configuration-on-android-q

Don't know why this design decision is made.

In our system however, we coud simply export all saved `WifiNetworkSuggestion`.

[`WifiNetworkSuggestion`](https://developer.android.com/reference/android/net/wifi/WifiNetworkSuggestion.html) in android is an opaque object. It can only be constructed via a builder class [WifiNetworkSuggestion.Builder](https://developer.android.com/reference/android/net/wifi/WifiNetworkSuggestion.Builder).

This builder class accepts the following methods:

```java
setBssid(MacAddress bssid)
setIsAppInteractionRequired(boolean isAppInteractionRequired)
setIsEnhancedOpen(boolean isEnhancedOpen)
setIsHiddenSsid(boolean isHiddenSsid)
setIsMetered(boolean isMetered)
setIsUserInteractionRequired(boolean isUserInteractionRequired)
setPriority(int priority)
setSsid(String ssid)
setWpa2EnterpriseConfig(WifiEnterpriseConfig enterpriseConfig)
setWpa2Passphrase(String passphrase)
setWpa3EnterpriseConfig(WifiEnterpriseConfig enterpriseConfig)
setWpa3Passphrase(String passphrase)
```

The corresponding WifiNetworkSuggestions looks like. The passphrase is not provided
for retrieval.

```json
{
    bssid: "string, mac address",
    isHiddenSsid: true,
    priority: 20,
    ssid: "string, ssid",
    wpa2Passphrase: 'string, passphrase'
}
```

**Question**

what is the identifier?

add, update, and delete supported. 

## Active Connection and Connectivity

```
getConnectionInfo
getDhcpInfo
getWifiState
```

```java
var wifiNetworkSpecifier = WifiNetworkSpecifier.Builder()
    .setSsid(ssid)
    .setWpa2Passphrase(passphrase)
    .setBssid(mac)
    .build()

var networkRequest = NetworkRequest.Builder()
    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
    .setNetworkSpecifier(wifiNetworkSpecifier)
    .build()

var connectivityManager = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

connectivityManager.requestNetwork(networkRequest, ConnectivityManager.NetworkCallback())
```

Several steps to construct a network connection.

**Question** 

Any other GET methods on connectivityManager may be of interest to user?

NetworkCallback has several events, which means there should be event stream.

https://developer.android.com/reference/android/net/ConnectivityManager.NetworkCallback.html

## Scan Result

```java
public List<ScanResult> getScanResults ()
```

https://developer.android.com/reference/android/net/wifi/ScanResult.html

```json
{
    bssid: "mac address",
    ssid: "string",
    capabilities: "string",
    centerFreq0: 10,
    centerFreq1: 10,
    channelWidth: 10,
    frequency: 10,
    level: 10,
    operatorFriendlyName: "not implemented",
    timestamp: 123456,
    venueName: "not implemented yet",
    is80211mcResponder: "boolean, not implemented",
    isPasspointNetwork: "boolean, not implemented"
}
```

# Summary


