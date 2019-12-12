import Player from "./player";
import MainScene from "./main-scene";

const DEGREES_TO_RADIANS = Math.PI / 180;

export default class Grab {

    player: Player;
    grabSensor: MatterJS.Body;
    bodyCaught: MatterJS.Body;
    body: Phaser.Physics.Matter.MatterPhysics;
    isGrabbing: boolean;

    constructor(player: Player, scene: MainScene) {
        this.player = player;
        this.grabSensor = scene.matter.add.rectangle(player.sprite.x, player.sprite.y, 30, 50, { isSensor: true, isStatic: true, angle: -35 * DEGREES_TO_RADIANS });
        this.bodyCaught = null;
        this.isGrabbing = false;

        scene.matterCollision.addOnCollideStart({
            objectA: [this.grabSensor],
            callback: this.onSensorCollide,
            context: this
        });
        // scene.matterCollision.addOnCollideActive({
        //     objectA: [this.grabSensor],
        //     callback: this.onSensorCollide,
        //     context: this
        // });
        scene.matterCollision.addOnCollideEnd({
            objectA: [this.grabSensor],
            callback: this.onSensorEnd,
            context: this
        });

    }

    onSensorCollide({ bodyA, bodyB, pair }: any) {
        if (bodyB.isSensor || (bodyB.gameObject.getData('name') != "crate")) return; // We only care about collisions with physical objects and crates
        bodyB.gameObject.setAlpha(0.5, 0.5, 0.5, 0.5);
        this.bodyCaught = bodyB;
    }

    onSensorEnd({ bodyA, bodyB, pair }: any) {
        if (!bodyB.gameObject) return;
        if (bodyB.isSensor || (bodyB.gameObject.getData('name') != "crate")) return; // We only care about collisions with physical objects and crates
        bodyB.gameObject.setAlpha(1, 1, 1, 1);
    }

    keyDown() {
        // @ts-ignore
        const { Body } = Phaser.Physics.Matter.Matter;
        const bodyCaught = this.bodyCaught as any;
        if (bodyCaught && !this.isGrabbing) { // si un object est dispo
            this.isGrabbing = true;

            bodyCaught.ignoreGravity = true;
            Body.setPosition(bodyCaught, { x: this.player.sprite.getCenter().x, y: this.player.sprite.getCenter().y - 80 });
        }
    }

    keyUp() {
        if (this.isGrabbing) {
            const bodyCaught = this.bodyCaught as any;
            bodyCaught.ignoreGravity = false;
            this.isGrabbing = false;
        }
    }

    update() {
        // @ts-ignore
        const { Body } = Phaser.Physics.Matter.Matter;
        // Change sensor position when the player change direction
        if (!this.player.direction) { // left
            Body.setAngle(this.grabSensor, -35);
            Body.setPosition(this.grabSensor, { x: this.player.sprite.getCenter().x - 30, y: this.player.sprite.getCenter().y + 10 });
        } else { // right
            Body.setAngle(this.grabSensor, 35);
            Body.setPosition(this.grabSensor, { x: this.player.sprite.getCenter().x + 30, y: this.player.sprite.getCenter().y + 10 });
        }

    }

    destroy() {
    }

}
