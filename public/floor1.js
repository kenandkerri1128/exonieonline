var floor1MapData = {
    "id": "floor1",
    "name": "Floor 1",
    "image": "floor1.png",
    "spawnX": 960,
    "spawnY": 1000,
    "collisions": [],
    "teleports": [
        {
            "portalId": 2,
            "x": 900,
            "y": 1200,
            "w": 150,
            "h": 80,
            "targetMapId": "town"
        }
    ],
    "normalSpawns": [],
    "miniBossSpawns": [],
    "floorBossSpawns": []
};

if(typeof window !== 'undefined') window['floor1MapData'] = floor1MapData;
