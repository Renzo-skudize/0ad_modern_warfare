// (A serious implementation of this might want to use C++ instead of JS
// for performance; this is just for fun.)
const SHORT_FINAL = 2.5;
function UnitMotionFlying() {}

UnitMotionFlying.prototype.Schema =
	"<element name='MaxSpeed'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='TakeoffSpeed'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<optional>" +
		"<element name='StationaryDistance' a:help='Allows the object to be stationary when reaching a target. Value defines the maximum distance at which a target is considered reached.'>" +
			"<ref name='positiveDecimal'/>" +
		"</element>" +
	"</optional>" +
	"<element name='LandingSpeed'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='AccelRate'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='SlowingRate'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='BrakingRate'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='TurnRate'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='OvershootTime'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='FlyingHeight'>" +
		"<data type='decimal'/>" +
	"</element>" +
	"<element name='ClimbRate'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='DiesInWater'>" +
		"<data type='boolean'/>" +
	"</element>" +
	"<element name='PassabilityClass'>" +
		"<text/>" +
	"</element>";

UnitMotionFlying.prototype.Init = function()
{
	this.hasTarget = false;
	this.reachedTarget = false;
	this.targetX = 0;
	this.targetZ = 0;
	this.targetMinRange = 0;
	this.targetMaxRange = 0;
	this.speed = 0;
	this.landing = false;
	this.onGround = true;
	this.pitch = 0;
	this.roll = 0;
	this.waterDeath = false;
	this.passabilityClass = Engine.QueryInterface(SYSTEM_ENTITY, IID_Pathfinder).GetPassabilityClass(this.template.PassabilityClass);
};

UnitMotionFlying.prototype.OnUpdate = function(msg)
{
	let turnLength = msg.turnLength;
	if (!this.hasTarget)
		return;
	let cmpGarrisonHolder = Engine.QueryInterface(this.entity, IID_GarrisonHolder);
	let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	let pos = cmpPosition.GetPosition();
	let angle = cmpPosition.GetRotation().y;
	let cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
	let cmpWaterManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_WaterManager);
	let ground = Math.max(cmpTerrain.GetGroundLevel(pos.x, pos.z), cmpWaterManager.GetWaterLevel(pos.x, pos.z));
	let newangle = angle;
	let canTurn = true;
	let distanceToTargetSquared = Math.euclidDistance2DSquared(pos.x, pos.z, this.targetX, this.targetZ);
	if (this.landing)
	{
		if (this.speed > 0 && this.onGround)
		{
			if (pos.y <= cmpWaterManager.GetWaterLevel(pos.x, pos.z) && this.template.DiesInWater == "true")
				this.waterDeath = true;
			this.pitch = 0;
			// Deaccelerate forwards...at a very reduced pace.
			if (this.waterDeath)
				this.speed = Math.max(0, this.speed - turnLength * this.template.BrakingRate * 10);
			else
				this.speed = Math.max(0, this.speed - turnLength * this.template.BrakingRate);
			canTurn = false;
			// Clamp to ground if below it, or descend if above.
			if (pos.y < ground)
				pos.y = ground;
			else if (pos.y > ground)
				pos.y = Math.max(ground, pos.y - turnLength * this.template.ClimbRate);
		}
		else if (this.speed == 0 && this.onGround)
		{
			let cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
			if (this.waterDeath && cmpHealth)
				cmpHealth.Kill();
			else
			{
				this.pitch = 0;
				// We've stopped.
				if (cmpGarrisonHolder)
					cmpGarrisonHolder.AllowGarrisoning(true, "UnitMotionFlying");
				canTurn = false;
				this.hasTarget = false;
				this.landing = false;
				// Summon planes back from the edge of the map.
				let terrainSize = cmpTerrain.GetMapSize();
				let cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
				if (cmpRangeManager.GetLosCircular())
				{
					let mapRadius = terrainSize/2;
					let x = pos.x - mapRadius;
					let z = pos.z - mapRadius;
					let div = (mapRadius - 12) / Math.sqrt(x*x + z*z);
					if (div < 1)
					{
						pos.x = mapRadius + x*div;
						pos.z = mapRadius + z*div;
						newangle += Math.PI;
						distanceToTargetSquared = Math.euclidDistance2DSquared(pos.x, pos.z, this.targetX, this.targetZ);
					}
				}
				else
				{
					pos.x = Math.max(Math.min(pos.x, terrainSize - 12), 12);
					pos.z = Math.max(Math.min(pos.z, terrainSize - 12), 12);
					newangle += Math.PI;
					distanceToTargetSquared = Math.euclidDistance2DSquared(pos.x, pos.z, this.targetX, this.targetZ);
				}
			}
		}
		else
		{
			// Final Approach.
			// We need to slow down to land!
			this.speed = Math.max(this.template.LandingSpeed, this.speed - turnLength * this.template.SlowingRate);
			canTurn = false;
			let targetHeight = ground;
			// Steep, then gradual descent.
			if ((pos.y - targetHeight) / this.template.FlyingHeight > 1 / SHORT_FINAL)
				this.pitch = -Math.PI / 18;
			else
				this.pitch = Math.PI / 18;
			let descentRate = ((pos.y - targetHeight) / this.template.FlyingHeight * this.template.ClimbRate + SHORT_FINAL) * SHORT_FINAL;
			if (pos.y < targetHeight)
				pos.y = Math.max(targetHeight, pos.y + turnLength * descentRate);
			else if (pos.y > targetHeight)
				pos.y = Math.max(targetHeight, pos.y - turnLength * descentRate);
			if (targetHeight == pos.y)
			{
				this.onGround = true;
				if (targetHeight == cmpWaterManager.GetWaterLevel(pos.x, pos.z) && this.template.DiesInWater)
					this.waterDeath = true;
			}
		}
	}
	else
	{
		if (this.template.StationaryDistance && distanceToTargetSquared <= +this.template.StationaryDistance * +this.template.StationaryDistance)
		{
			cmpPosition.SetXZRotation(0, 0);
			this.pitch = 0;
			this.roll = 0;
			this.reachedTarget = true;
			cmpPosition.TurnTo(Math.atan2(this.targetX - pos.x, this.targetZ - pos.z));
			Engine.PostMessage(this.entity, MT_MotionUpdate, { "updateString": "likelySuccess" });
			return;
		}
		// If we haven't reached max speed yet then we're still on the ground;
		// otherwise we're taking off or flying.
		// this.onGround in case of a go-around after landing (but not fully stopped).

		if (this.speed < this.template.TakeoffSpeed && this.onGround)
		{
			if (cmpGarrisonHolder)
				cmpGarrisonHolder.AllowGarrisoning(false, "UnitMotionFlying");
			this.pitch = 0;
			// Accelerate forwards.
			this.speed = Math.min(this.template.MaxSpeed, this.speed + turnLength * this.template.AccelRate);
			canTurn = false;
			// Clamp to ground if below it, or descend if above.
			if (pos.y < ground)
				pos.y = ground;
			else if (pos.y > ground)
				pos.y = Math.max(ground, pos.y - turnLength * this.template.ClimbRate);
		}
		else
		{
			this.onGround = false;
			// Climb/sink to max height above ground.
			this.speed = Math.min(this.template.MaxSpeed, this.speed + turnLength * this.template.AccelRate);
			let targetHeight = ground + (+this.template.FlyingHeight);
			if (Math.abs(pos.y-targetHeight) > this.template.FlyingHeight/5)
			{
				this.pitch = Math.PI / 9;
				canTurn = false;
			}
			else
				this.pitch = 0;
			if (pos.y < targetHeight)
				pos.y = Math.min(targetHeight, pos.y + turnLength * this.template.ClimbRate);
			else if (pos.y > targetHeight)
			{
				pos.y = Math.max(targetHeight, pos.y - turnLength * this.template.ClimbRate);
				this.pitch = -1 * this.pitch;
			}
		}
	}

	// If we're in range of the target then tell people that we've reached it.
	// (TODO: quantisation breaks this)
	if (!this.reachedTarget &&
		this.targetMinRange * this.targetMinRange <= distanceToTargetSquared &&
		distanceToTargetSquared <= this.targetMaxRange * this.targetMaxRange)
	{
		this.reachedTarget = true;
		Engine.PostMessage(this.entity, MT_MotionUpdate, { "updateString": "likelySuccess" });
	}

	// If we're facing away from the target, and are still fairly close to it,
	// then carry on going straight so we overshoot in a straight line.
	let isBehindTarget = ((this.targetX - pos.x) * Math.sin(angle) + (this.targetZ - pos.z) * Math.cos(angle) < 0);
	// Overshoot the target: carry on straight.
	if (isBehindTarget && distanceToTargetSquared < this.template.MaxSpeed * this.template.MaxSpeed * this.template.OvershootTime * this.template.OvershootTime)
		canTurn = false;

	if (canTurn)
	{
		// Turn towards the target.
		let targetAngle = Math.atan2(this.targetX - pos.x, this.targetZ - pos.z);
		let delta = targetAngle - angle;
		// Wrap delta to -pi..pi.
		delta = (delta + Math.PI) % (2*Math.PI);
		if (delta < 0)
			delta += 2 * Math.PI;
		delta -= Math.PI;
		// Clamp to max rate.
		let deltaClamped = Math.min(Math.max(delta, -this.template.TurnRate * turnLength), this.template.TurnRate * turnLength);
		// Calculate new orientation, in a peculiar way in order to make sure the
		// result gets close to targetAngle (rather than being n*2*pi out).
		newangle = targetAngle + deltaClamped - delta;
		if (newangle - angle > Math.PI / 18)
			this.roll = Math.PI / 9;
		else if (newangle - angle < -Math.PI / 18)
			this.roll = -Math.PI / 9;
		else
			this.roll = newangle - angle;
	}
	else
		this.roll = 0;

	pos.x += this.speed * turnLength * Math.sin(angle);
	pos.z += this.speed * turnLength * Math.cos(angle);
	cmpPosition.SetHeightFixed(pos.y);
	cmpPosition.TurnTo(newangle);
	cmpPosition.SetXZRotation(this.pitch, this.roll);
	cmpPosition.MoveTo(pos.x, pos.z);
};

UnitMotionFlying.prototype.MoveToPointRange = function(x, z, minRange, maxRange)
{
	this.hasTarget = true;
	this.landing = false;
	this.reachedTarget = false;
	this.targetX = x;
	this.targetZ = z;
	this.targetMinRange = minRange;
	this.targetMaxRange = maxRange;

	return true;
};

UnitMotionFlying.prototype.MoveToTargetRange = function(target, minRange, maxRange)
{
	let cmpTargetPosition = Engine.QueryInterface(target, IID_Position);
	if (!cmpTargetPosition || !cmpTargetPosition.IsInWorld())
		return false;

	let targetPos = cmpTargetPosition.GetPosition2D();

	this.hasTarget = true;
	this.reachedTarget = false;
	this.targetX = targetPos.x;
	this.targetZ = targetPos.y;
	this.targetMinRange = minRange;
	this.targetMaxRange = maxRange;

	return true;
};

UnitMotionFlying.prototype.SetMemberOfFormation = function()
{
	// Ignored.
};

UnitMotionFlying.prototype.GetWalkSpeed = function()
{
	return +this.template.MaxSpeed;
};

UnitMotionFlying.prototype.SetSpeedMultiplier = function(multiplier)
{
	// Ignore this, the speed is always the walk speed.
};

UnitMotionFlying.prototype.GetRunMultiplier = function()
{
	return 1;
};

/**
 * Estimate the next position of the unit. Just linearly extrapolate.
 * TODO: Reuse the movement code for a better estimate.
 */
UnitMotionFlying.prototype.EstimateFuturePosition = function(dt)
{
	let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	if (!cmpPosition || !cmpPosition.IsInWorld())
		return Vector2D();
	let position = cmpPosition.GetPosition2D();

	return Vector2D.add(position, Vector2D.sub(position, cmpPosition.GetPreviousPosition2D()).mult(dt/Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer).GetLatestTurnLength()));
};

UnitMotionFlying.prototype.IsMoveRequested = function()
{
	return this.hasTarget;
};

UnitMotionFlying.prototype.GetCurrentSpeed = function()
{
	return this.speed;
};

UnitMotionFlying.prototype.GetSpeedMultiplier = function()
{
	return this.speed / +this.template.MaxSpeed;
};

UnitMotionFlying.prototype.GetAcceleration = function()
{
	return +this.template.AccelRate;
};

UnitMotionFlying.prototype.SetAcceleration = function()
{
	// Acceleration is set by the template. Ignore.
};

UnitMotionFlying.prototype.GetPassabilityClassName = function()
{
	return this.passabilityClassName ? this.passabilityClassName : this.template.PassabilityClass;
};

UnitMotionFlying.prototype.SetPassabilityClassName = function(passClassName)
{
	this.passabilityClassName = passClassName;
	const cmpPathfinder = Engine.QueryInterface(SYSTEM_ENTITY, IID_Pathfinder);
	if (cmpPathfinder)
		this.passabilityClass = cmpPathfinder.GetPassabilityClass(passClassName);
};

UnitMotionFlying.prototype.GetPassabilityClass = function()
{
	return this.passabilityClass;
};

UnitMotionFlying.prototype.FaceTowardsPoint = function(x, z)
{
	// Ignore this - angle is controlled by the target-seeking code instead.
};

UnitMotionFlying.prototype.SetFacePointAfterMove = function()
{
	// Ignore this - angle is controlled by the target-seeking code instead.
};

UnitMotionFlying.prototype.StopMoving = function()
{
	// Invert.
	if (!this.waterDeath)
		this.landing = !this.landing;

};

UnitMotionFlying.prototype.SetDebugOverlay = function(enabled)
{
};

Engine.RegisterComponentType(IID_UnitMotion, "UnitMotionFlying", UnitMotionFlying);
Almost all art files are based on code from 0ad (or some GitHub 0ad mods), 
like almost everything found in gui/~ or simulation/~, with the exception 
of one file from the OpenRA source code.


// Copyright & License Information
/*
 * Copyright (c) The OpenRA Developers and Contributors
 * This file is part of OpenRA, which is free software. It is made
 * available to you under the terms of the GNU General Public License
 * as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version. For more
 * information, see COPYING.
 */

// Required imports - these would need to be adjusted based on the actual JavaScript module structure
import { Activity } from '../Activities/Activity.js';
import { Aircraft } from '../Traits/Aircraft.js';
import { AttackAircraft } from '../Traits/AttackAircraft.js';
import { Rearmable } from '../Traits/Rearmable.js';
import { Target, TargetType } from '../Primitives/Target.js';
import { WDist } from '../Primitives/WDist.js';
import { Color } from '../Primitives/Color.js';
import { BitSet } from '../Primitives/BitSet.js';
import { TargetLineNode } from '../Primitives/TargetLineNode.js';
import { AttackSource, AirAttackType, UnitStance } from '../Traits/Enums.js';
import { TakeOff } from './TakeOff.js';
import { ReturnToBase } from './ReturnToBase.js';
import { Fly } from './Fly.js';
import { FlyForward } from './FlyForward.js';
import { Util } from '../Util.js';

export class FlyAttack extends Activity {
	constructor(self, source, target, forceAttack, targetLineColor) {
		super();
		
		// readonly fields
		this.aircraft = self.trait('Aircraft');
		this.attackAircraft = self.trait('AttackAircraft');
		this.rearmable = self.traitOrDefault('Rearmable');
		this.source = source;
		this.forceAttack = forceAttack;
		this.targetLineColor = targetLineColor;
		this.strafeDistance = this.attackAircraft.info.strafeRunLength;
		
		// Instance fields
		this.target = target;
		this.lastVisibleTarget = null;
		this.lastVisibleMaximumRange = null;
		this.lastVisibleTargetTypes = null;
		this.lastVisibleOwner = null;
		this.useLastVisibleTarget = false;
		this.hasTicked = false;
		this.returnToBase = false;
		
		this.childHasPriority = false;

		// The target may become hidden between the initial order request and the first tick (e.g. if queued)
		// Moving to any position (even if quite stale) is still better than immediately giving up
		if ((target.type === TargetType.Actor && target.actor.canBeViewedByPlayer(self.owner))
			|| target.type === TargetType.FrozenActor || target.type === TargetType.Terrain) {
			
			this.lastVisibleTarget = Target.fromPos(target.centerPosition);
			this.lastVisibleMaximumRange = this.attackAircraft.getMaximumRangeVersusTarget(target);

			if (target.type === TargetType.Actor) {
				this.lastVisibleOwner = target.actor.owner;
				this.lastVisibleTargetTypes = target.actor.getEnabledTargetTypes();
			} else if (target.type === TargetType.FrozenActor) {
				this.lastVisibleOwner = target.frozenActor.owner;
				this.lastVisibleTargetTypes = target.frozenActor.targetTypes;
			}
		}
	}

	tick(self) {
		if (!this.isCanceling && !this.hasArmamentsFor(this.target)) {
			this.cancel(self, true);
		}

		if (!this.tickChild(self)) {
			return false;
		}

		this.returnToBase = false;

		// Refuse to take off if it would land immediately again.
		if (this.aircraft.forceLanding) {
			this.cancel(self);
		}

		if (this.isCanceling) {
			return true;
		}

		// Check that AttackFollow hasn't cancelled the target by modifying attack.Target
		// Having both this and AttackFollow modify that field is a horrible hack.
		if (this.hasTicked && this.attackAircraft.requestedTarget.type === TargetType.Invalid) {
			return true;
		}

		if (this.attackAircraft.isTraitPaused) {
			return false;
		}

		const recalculateResult = this.target.recalculate(self.owner);
		this.target = recalculateResult.target;
		const targetIsHiddenActor = recalculateResult.isHidden;
		
		this.attackAircraft.setRequestedTarget(this.target, this.forceAttack);
		this.hasTicked = true;

		if (!targetIsHiddenActor && this.target.type === TargetType.Actor) {
			this.lastVisibleTarget = Target.fromTargetPositions(this.target);
			this.lastVisibleMaximumRange = this.attackAircraft.getMaximumRangeVersusTarget(this.target);
			this.lastVisibleOwner = this.target.actor.owner;
			this.lastVisibleTargetTypes = this.target.actor.getEnabledTargetTypes();
		}

		// The target may become hidden in the same tick the FlyAttack constructor is called,
		// causing lastVisible* to remain uninitialized.
		// Fix the fallback values based on the frozen actor properties
		else if (this.target.type === TargetType.FrozenActor && !this.lastVisibleTarget.isValidFor(self)) {
			this.lastVisibleTarget = Target.fromTargetPositions(this.target);
			this.lastVisibleMaximumRange = this.attackAircraft.getMaximumRangeVersusTarget(this.target);
			this.lastVisibleOwner = this.target.frozenActor.owner;
			this.lastVisibleTargetTypes = this.target.frozenActor.targetTypes;
		}

		this.useLastVisibleTarget = targetIsHiddenActor || !this.target.isValidFor(self);

		// Target is hidden or dead, and we don't have a fallback position to move towards
		if (this.useLastVisibleTarget && !this.lastVisibleTarget.isValidFor(self)) {
			return true;
		}

		// If all valid weapons have depleted their ammo and Rearmable trait exists, return to RearmActor to reload
		// and resume the activity after reloading if AbortOnResupply is set to 'false'
		if (this.rearmable !== null && !this.useLastVisibleTarget && this.attackAircraft.armaments.every(x => x.isTraitPaused || !x.weapon.isValidAgainst(this.target, self.world, self))) {
			// Attack moves never resupply
			if (this.source === AttackSource.AttackMove) {
				return true;
			}

			// AbortOnResupply cancels the current activity (after resupplying) plus any queued activities
			if (this.attackAircraft.info.abortOnResupply) {
				this.nextActivity?.cancel(self);
			}

			this.queueChild(new ReturnToBase(self));
			this.returnToBase = true;
			return this.attackAircraft.info.abortOnResupply;
		}

		const pos = self.centerPosition;
		const checkTarget = this.useLastVisibleTarget ? this.lastVisibleTarget : this.target;

		const minimumRange = this.attackAircraft.info.attackType === AirAttackType.Strafe ? WDist.zero : this.attackAircraft.getMinimumRangeVersusTarget(this.target);

		if (this.lastVisibleMaximumRange === WDist.zero || this.lastVisibleMaximumRange < minimumRange) {
			return true;
		}

		const delta = this.attackAircraft.getTargetPosition(pos, this.target).subtract(pos);
		const desiredFacing = delta.horizontalLengthSquared !== 0 ? delta.yaw : this.aircraft.facing;

		this.queueChild(new TakeOff(self));

		// Move into range of the target.
		if (!checkTarget.isInRange(pos, this.lastVisibleMaximumRange) || checkTarget.isInRange(pos, minimumRange)) {
			this.queueChild(this.aircraft.moveWithinRange(this.target, minimumRange, this.lastVisibleMaximumRange, checkTarget.centerPosition, Color.red));
		}

		// We've reached the assumed position but it is not there - give up
		else if (this.useLastVisibleTarget) {
			return true;
		}

		// The aircraft must keep moving forward even if it is already in an ideal position.
		else if (this.attackAircraft.info.attackType === AirAttackType.Strafe) {
			this.queueChild(new StrafeAttackRun(this.attackAircraft, this.aircraft, this.target, this.strafeDistance !== WDist.zero ? this.strafeDistance : this.lastVisibleMaximumRange));
		} else if (this.attackAircraft.info.attackType === AirAttackType.Default && !this.aircraft.info.canHover) {
			this.queueChild(new FlyAttackRun(this.target, this.lastVisibleMaximumRange, this.attackAircraft));
		}

		// Turn to face the target if required.
		else if (!this.attackAircraft.targetInFiringArc(self, this.target, this.attackAircraft.info.facingTolerance)) {
			this.aircraft.facing = Util.tickFacing(this.aircraft.facing, desiredFacing, this.aircraft.turnSpeed);
		}

		return false;
	}

	onLastRun(self) {
		// Cancel the requested target, but keep firing on it while in range
		this.attackAircraft.clearRequestedTarget();
	}

	// IActivityNotifyStanceChanged implementation
	stanceChanged(self, autoTarget, oldStance, newStance) {
		// Cancel non-forced targets when switching to a more restrictive stance if they are no longer valid for auto-targeting
		if (newStance > oldStance || this.forceAttack) {
			return;
		}

		// If lastVisibleTarget is invalid we could never view the target in the first place, so we just drop it here too
		if (!this.lastVisibleTarget.isValidFor(self) || !autoTarget.hasValidTargetPriority(self, this.lastVisibleOwner, this.lastVisibleTargetTypes)) {
			this.attackAircraft.clearRequestedTarget();
		}
	}

	*targetLineNodes(self) {
		if (this.targetLineColor !== null) {
			if (this.returnToBase) {
				yield* this.childActivity.targetLineNodes(self);
			}
			if (!this.returnToBase || !this.attackAircraft.info.abortOnResupply) {
				yield new TargetLineNode(this.useLastVisibleTarget ? this.lastVisibleTarget : this.target, this.targetLineColor);
			}
		}
	}

	hasArmamentsFor(target) {
		return !this.attackAircraft.isTraitDisabled && this.attackAircraft.chooseArmamentsForTarget(target, this.forceAttack).length > 0;
	}
}

export class FlyAttackRun extends Activity {
	constructor(target, exitRange, attack) {
		super();
		
		this.childHasPriority = false;
		
		this.target = target;
		this.exitRange = exitRange;
		this.attack = attack;
		this.targetIsVisibleActor = false;
	}

	onFirstRun(self) {
		// The target may have died while this activity was queued
		if (this.target.isValidFor(self)) {
			this.queueChild(new Fly(self, this.target, this.target.centerPosition));

			// Fly a single tick forward so we have passed the target and start flying out of range facing away from it
			this.queueChild(new FlyForward(self, 1));
			this.queueChild(new Fly(self, this.target, this.exitRange, WDist.maxValue, this.target.centerPosition));
		} else {
			this.cancel(self);
		}
	}

	tick(self) {
		if (this.tickChild(self) || this.isCanceling) {
			return true;
		}

		// Cancel the run if the target become invalid (e.g. killed) while visible
		const targetWasVisibleActor = this.targetIsVisibleActor;
		const recalculateResult = this.target.recalculate(self.owner);
		this.target = recalculateResult.target;
		const targetIsHiddenActor = recalculateResult.isHidden;
		this.targetIsVisibleActor = this.target.type === TargetType.Actor && !targetIsHiddenActor;

		if (targetWasVisibleActor && (!this.target.isValidFor(self) || !this.attack.hasAnyValidWeapons(this.target))) {
			this.cancel(self);
		}

		return false;
	}
}

export class StrafeAttackRun extends Activity {
	constructor(attackAircraft, aircraft, target, exitRange) {
		super();
		
		this.childHasPriority = false;
		
		this.target = target;
		this.attackAircraft = attackAircraft;
		this.aircraft = aircraft;
		this.exitRange = exitRange;
	}

	onFirstRun(self) {
		// The target may have died while this activity was queued
		if (this.target.isValidFor(self)) {
			this.queueChild(new Fly(self, this.target, this.target.centerPosition));
			this.queueChild(new FlyForward(self, this.exitRange));

			// Exit the range and then fly enough to turn towards the target for another run
			const distanceToTurn = new WDist(this.aircraft.info.speed * 256 / this.aircraft.info.turnSpeed.angle);
			this.queueChild(new Fly(self, this.target, this.exitRange.add(distanceToTurn), WDist.maxValue, this.target.centerPosition));
		} else {
			this.cancel(self);
		}
	}

	tick(self) {
		if (this.tickChild(self) || this.isCanceling) {
			return true;
		}

		// Strafe attacks target the ground below the original target
		// Update the position if we seen the target move; keep the previous one if it dies or disappears
		const recalculateResult = this.target.recalculate(self.owner);
		this.target = recalculateResult.target;
		const targetIsHiddenActor = recalculateResult.isHidden;
		
		if (!targetIsHiddenActor && this.target.type === TargetType.Actor) {
			this.attackAircraft.setRequestedTarget(Target.fromTargetPositions(this.target), true);
		}

		return false;
	}
}
