/*
A set of static data from the /data/wow/connected-realm/index api
*/

export const bnetLocales = [
  'en-us',
  'de-de',
  'en-gb',
  'es-es',
  'es-mx',
  'fr-fr',
  'it-it',
  'pt-br',
  'pt-pt',
  'ru-ru',
  'ko-kr',
  'zh-tw',
  'zh-cn',
];

const US_CONNECTED_REALM_IDS = [
  4, 5, 9, 11, 12, 47, 52, 53, 54, 55, 57, 58, 60, 61, 63, 64, 67, 69, 71, 73, 75, 76, 77, 78, 84, 86, 96, 99, 100, 104,
  106, 113, 114, 115, 117, 118, 120, 121, 125, 127, 151, 154, 155, 157, 158, 160, 162, 163, 1070, 1071, 1072, 1129,
  1136, 1138, 1147, 1151, 1168, 1171, 1175, 1184, 1185, 1190, 1425, 1426, 1427, 1428, 3207, 3208, 3209, 3234, 3661,
  3675, 3676, 3678, 3683, 3684, 3685, 3693, 3694, 3721, 3723, 3725, 3726,
];

const KR_CONNECTED_REALM_IDS = [205, 210, 214, 2116];

const TW_CONNECTED_REALM_IDS = [963, 966, 980];

const EU_CONNECTED_REALM_IDS = [
  509, 510, 512, 531, 570, 578, 580, 581, 604, 612, 633, 1080, 1082, 1084, 1085, 1091, 1092, 1096, 1097, 1098, 1099,
  1104, 1105, 1121, 1122, 1127, 1301, 1302, 1303, 1305, 1307, 1309, 1313, 1315, 1316, 1325, 1329, 1331, 1335, 1378,
  1379, 1384, 1385, 1388, 1390, 1393, 1396, 1400, 1401, 1402, 1403, 1405, 1406, 1408, 1416, 1417, 1587, 1596, 1597,
  1598, 1602, 1604, 1605, 1614, 1615, 1618, 1621, 1623, 1624, 1922, 1923, 1925, 1928, 1929, 2073, 2074, 3391, 3656,
  3657, 3666, 3674, 3679, 3681, 3682, 3686, 3690, 3691, 3692, 3696, 3702, 3703, 3713,
];

export function realmIdToRegion(realmId: number | string) {
  if (typeof realmId === 'string') {
    realmId = parseInt(realmId);
  }
  if (US_CONNECTED_REALM_IDS.includes(realmId)) {
    return 'us';
  }
  if (EU_CONNECTED_REALM_IDS.includes(realmId)) {
    return 'eu';
  }
  if (TW_CONNECTED_REALM_IDS.includes(realmId)) {
    return 'tw';
  }
  if (KR_CONNECTED_REALM_IDS.includes(realmId)) {
    return 'kr';
  }
  return 'def';
}
