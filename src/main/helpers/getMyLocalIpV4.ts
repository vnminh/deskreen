import os from "os";

// Wi-Fi interface patterns for detection and prioritization
const macosWifiInterfaces = ["en0", "en1"]; // macOS Wi-Fi interfaces (commonly en0, en1, though can also be Ethernet)
const linuxWifiPrefixes = ["wlan", "wlo", "wlp"]; // Linux Wi-Fi interface prefixes
const windowsWifiInterfaces = [
  "Wi-Fi",
  "Wireless LAN adapter Wi-Fi",
  "Wireless LAN adapter",
  "Wireless Network Connection",
  "WLAN",
]; // Windows Wi-Fi interface patterns

// Virtualization interface patterns
const virtualPrefixes = [
  "docker", // Docker Bridge
  "veth", // Linux Virtual Ethernet (Containers)
  "virbr", // Linux KVM/QEMU/Libvirt
  "vboxnet", // VirtualBox (Linux/macOS)
  "vmnet", // VMware (Linux/macOS)
  "br-", // Linux Bridge (often Docker or custom)
  "VirtualBox", // Windows VirtualBox
  "VMware", // Windows VMware
];

const virtualInterfaces = [
  "awdl0", // macOS peer-to-peer (AirDrop)
  "bridge100", // macOS bridge (virtual interface)
  "vEthernet", // Windows Ethernet Hyper-V
  "docker0", // Linux Docker standard bridge
  "virbr0",  // Linux KVM/QEMU standard bridge
  "vboxnet0", // VirtualBox (Linux/macOS)
  "vmnet1",   // VMware (Linux/macOS)
  "vmnet8",   // VMware (Linux/macOS)
  "VirtualBox Host-Only Network", // Windows VirtualBox
  "VMware Network Adapter VMnet1", // Windows VMware
  "VMware Network Adapter VMnet8", // Windows VMware
];

export const interfacesToCheck = [
  ...macosWifiInterfaces, // macOS Wi-Fi or Ethernet
  "eth0", // macOS or Linux Ethernet (older setups)
  "wlan0", // Linux/Android Wi-Fi
  "wlan1", // Linux/Android Wi-Fi
  "wlpXsY", // Linux (newer predictable names for Wi-Fi)
  "eth1", // Linux Ethernet (older setups)
  "enpXsY", // Linux predictable names for Ethernet
  "enxXXXXXX", // Linux Ethernet (based on MAC address)
  ...windowsWifiInterfaces, // Windows Wi-Fi
  "Ethernet", // Windows Ethernet
  "Local Area Connection", // Windows Ethernet (older versions)
  "usb0", // Android/Chrome OS USB Ethernet adapters
  ...virtualInterfaces,
];

export const interfacesStartsWithCheck = [
  "usb", // Android/Chrome OS USB Ethernet adapters
  "en", // macOS Ethernet interfaces
  "eth", // Linux Ethernet interfaces
  ...linuxWifiPrefixes, // Linux/Android Wi-Fi interfaces
  "enx", // Linux Ethernet based on MAC address
  ...windowsWifiInterfaces, // Windows Wi-Fi
  "Ethernet", // Windows Ethernet
  "vEthernet", // Windows Ethernet Hyper-V
  "Local Area Connection", // Windows Ethernet (older versions)
  ...virtualPrefixes,
];

/**
 * Check if an interface name indicates a Wi-Fi interface across all operating systems
 * @param interfaceName - The network interface name to check
 * @returns true if the interface is likely Wi-Fi, false otherwise
 */
function isWifiInterface(interfaceName: string): boolean {
  // Check exact matches for macOS
  if (macosWifiInterfaces.includes(interfaceName)) {
    return true;
  }
  
  // Check if starts with Linux Wi-Fi patterns
  if (linuxWifiPrefixes.some((pattern) => interfaceName.startsWith(pattern))) {
    return true;
  }
  
  // Check if starts with or equals Windows Wi-Fi patterns
  if (
    windowsWifiInterfaces.some((pattern) =>
      interfaceName.startsWith(pattern) || interfaceName === pattern,
    )
  ) {
    return true;
  }
  
  return false;
}

/**
 * Check if an interface name or MAC prefix indicates a virtual interface
 * @param interfaceName - The network interface name to check
 * @param interfaceMacAddress - The network MAC address to check
 * @returns true if the interface is likely virtual, false otherwise
 */
function isVirtualInterface(interfaceName: string, interfaceMacAddress: string): boolean {
  // Typical virtual MAC prefixes
  const virtualMacPrefixes = [
    '00:15:5d', // Microsoft Hyper-V
    '00:05:69', // VMware
    '00:0c:29', // VMware
    '00:50:56', // VMware
    '00:1c:42', // Parallels
    '00:16:3e', // Xen
    '08:00:27', // VirtualBox
    '0a:00:27', // VirtualBox (Host-Only / LAA)
    '52:54:00', // QEMU/KVM
  ]

  if (
    virtualInterfaces.some((pattern) => 
      interfaceName.startsWith(pattern) || interfaceName === pattern
    )
  ) {
    return true;
  }

  if (virtualPrefixes.some((pattern) => interfaceName.startsWith(pattern))) {
    return true;
  }

  if (virtualMacPrefixes.some((pattern) => interfaceMacAddress.startsWith(pattern))) {
    return true;
  }

  return false;
}

/**
 * Get the active network interface name and its IPv4 address
 * Prioritizes Wi-Fi interfaces across all operating systems
 * @returns Object with interfaceName and ipAddress, or undefined if no valid interface found
 */
export function getActiveNetworkInterface(): { interfaceName: string; ipAddress: string } | undefined {
  // Get network interfaces
  const networkInterfaces = os.networkInterfaces();
  let virtualResult: { interfaceName: string; ipAddress: string } | undefined;
  let localResult: { interfaceName: string; ipAddress: string } | undefined;
  let wifiResult: { interfaceName: string; ipAddress: string } | undefined;
  
  // First pass: collect all valid interfaces, prioritizing Wi-Fi
  Object.entries(networkInterfaces).forEach(([networksKey, networks]) => {
    if (!networks) return;
    if (networksKey.startsWith("bridge")) return;
    if (
      !interfacesToCheck.includes(networksKey) &&
      !interfacesStartsWithCheck.some((prefix) =>
        networksKey.startsWith(prefix),
      )
    ) {
      return;
    }

    networks.forEach((network) => {
      if (!network.internal && network.family === "IPv4") {
        const currentResult = {
          interfaceName: networksKey,
          ipAddress: network.address,
        };
        
        // Prioritize Wi-Fi interfaces
        if (isWifiInterface(networksKey)) {
          if (!wifiResult) {
            wifiResult = currentResult;
          }
        } else if (!isVirtualInterface(networksKey, network.mac)){
          // Prioritize non-virtual interfaces next
          if (!localResult) {
            localResult = currentResult;
          }
        } else {
          // Store virtual interface as fallback
          if (!virtualResult) {
            virtualResult = currentResult;
          }
        }
      }
    });
  });

  // Return Wi-Fi interface if found, otherwise return fallback
  return wifiResult || localResult || virtualResult;
}

export default function getMyLocalIpV4(): string | undefined {
  // Get network interfaces
  const networkInterfaces = os.networkInterfaces();
  let localIp: string | undefined;
  let wifiIp: string | undefined;
  let fallbackIp: string | undefined;
  
  // First pass: collect all valid interfaces, prioritizing Wi-Fi
  Object.entries(networkInterfaces).forEach(([networksKey, networks]) => {
    if (!networks) return;
    if (networksKey.startsWith("bridge")) return;
    if (
      !interfacesToCheck.includes(networksKey) &&
      !interfacesStartsWithCheck.some((prefix) =>
        networksKey.startsWith(prefix),
      )
    ) {
      return;
    }

    networks.forEach((network) => {
      if (!network.internal && network.family === "IPv4") {
        // Prioritize Wi-Fi interfaces
        if (isWifiInterface(networksKey)) {
          if (!wifiIp) {
            wifiIp = network.address;
          }
        } else if (!isVirtualInterface(networksKey, network.mac)){
          // Prioritize non-virtual interfaces next
          if (!localIp) {
            localIp = network.address;
          }
        } else {
          // Store virtual interface as fallback
          if (!fallbackIp) {
            fallbackIp = network.address;
          }
        }
      }
    });
  });

  // Return Wi-Fi IP if found, otherwise return fallback
  return wifiIp || localIp || fallbackIp;
}

const knownUsbTetherSubnets = [
  "192.168.42.",
  "192.168.43.",
  "192.168.44.",
  "192.168.137.",
  "192.168.247.",
  "172.20.10.",
];

const usbInterfaceNamePattern =
  /(^usb|^enx|rndis|android|tether|mobile|remote ndis)/i;
const nonPhysicalInterfaceNamePattern =
  /(^tailscale|^tun|^tap|^wg|vpn|docker|veth|virbr|vbox|vmnet|bridge)/i;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  return (
    parts.length === 4 &&
    (parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
  );
}

/**
 * Resolve the host-side IPv4 address assigned by Android/iOS USB tethering.
 * Interface names differ by OS, so known tether subnets are also recognized.
 */
export function getUsbTetherNetwork():
  | { interfaceName: string; ipAddress: string }
  | undefined {
  const candidates: Array<{
    interfaceName: string;
    ipAddress: string;
    score: number;
  }> = [];
  const activeNetwork = getActiveNetworkInterface();

  Object.entries(os.networkInterfaces()).forEach(([interfaceName, networks]) => {
    networks?.forEach((network) => {
      if (network.internal || network.family !== "IPv4") return;
      if (!isPrivateIpv4(network.address)) return;
      if (
        isWifiInterface(interfaceName) ||
        isVirtualInterface(interfaceName, network.mac) ||
        nonPhysicalInterfaceNamePattern.test(interfaceName)
      ) {
        return;
      }

      const hasUsbName = usbInterfaceNamePattern.test(interfaceName);
      const hasKnownSubnet = knownUsbTetherSubnets.some((subnet) =>
        network.address.startsWith(subnet),
      );
      if (
        network.address === activeNetwork?.ipAddress &&
        !hasUsbName &&
        !hasKnownSubnet
      ) {
        return;
      }
      candidates.push({
        interfaceName,
        ipAddress: network.address,
        score: (hasUsbName ? 2 : 0) + (hasKnownSubnet ? 3 : 0),
      });
    });
  });

  const explicitMatches = candidates.filter((candidate) => candidate.score > 0);
  const match =
    explicitMatches.sort((a, b) => b.score - a.score)[0] ??
    (candidates.length === 1 ? candidates[0] : undefined);
  if (!match) return undefined;
  return {
    interfaceName: match.interfaceName,
    ipAddress: match.ipAddress,
  };
}
